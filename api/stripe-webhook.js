// Required Vercel environment variables:
//   STRIPE_WEBHOOK_SECRET  — signing secret from the Stripe Webhooks dashboard
//   STRIPE_SECRET_KEY      — Stripe secret key
//   RESEND_API_KEY         — API key from resend.com
//   NOTION_API_KEY         — Notion internal integration token (also used to read CBP Opportunities DB)
//   STRIPE_PRICE_BRONZE, STRIPE_PRICE_SILVER, STRIPE_PRICE_GOLD
//   STRIPE_PRICE_BRONZE_ANNUAL, STRIPE_PRICE_SILVER_ANNUAL, STRIPE_PRICE_GOLD_ANNUAL
//
// NOTE: Opportunity emails are read from the Notion "CBP Opportunities" database
// (dc9a3b8c-3f94-4f9c-a405-947e7f0f900f), NOT fetched live from Apify. Apify's weekly
// scrape writes into that Notion DB on its own schedule; this webhook only reads it.
// This keeps signup emails independent of Apify's live run status — if a scrape run
// fails, existing "Open" opportunities already in Notion are still sent.
//
// contractorbidprep.com must be verified as a sending domain in the Resend dashboard
// before emails will deliver.
//
// Register this endpoint in the Stripe dashboard under Developers → Webhooks:
//   https://www.contractorbidprep.com/api/stripe-webhook
//   (use the www host — the bare domain 308-redirects and Stripe does not follow
//   redirects on webhook deliveries)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');
const { Client } = require('@notionhq/client');
const crypto = require('crypto');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const CLIENT_PROFILES_DB = '948368a5-466a-4bf8-affb-083b7e8977d5';

const PRICE_TO_TIER = {
  [process.env.STRIPE_PRICE_BRONZE]: 'Bronze',
  [process.env.STRIPE_PRICE_SILVER]: 'Silver',
  [process.env.STRIPE_PRICE_GOLD]:   'Gold',
  [process.env.STRIPE_PRICE_BRONZE_ANNUAL]:  'Bronze',
  [process.env.STRIPE_PRICE_SILVER_ANNUAL]:  'Silver',
  [process.env.STRIPE_PRICE_GOLD_ANNUAL]:    'Gold',
};

const TRADE_VALUE_TO_LABEL = {
  roofing: 'Roofing',
  general_contracting: 'General Contracting',
  hvac: 'HVAC',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  other: 'Other',
};

function getCustomField(session, key) {
  const field = session.custom_fields?.find(f => f.key === key);
  if (!field) return null;
  return field[field.type]?.value || null;
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const resend = new Resend(process.env.RESEND_API_KEY);

function buildEmail(toAddress, firstName) {
  return {
    from: 'David Duncan <davidduncan@contractorbidprep.com>',
    to: toAddress,
    subject: "You're in — here's what happens next",
    text: `Hey ${firstName},

Welcome to Contractors Bid Prep. I'm David Duncan, founder of CBP — and I personally review every new enrollment.

Every week, my system scans government procurement portals for bids that match your trade and geography. When something comes in, you get an alert with the details and a direct link.

Our Gold subscribers take it a step further — they reply to a text with their number and CBP handles the rest. Bid document built, routed for e-signature, logged. If you ever want to talk about upgrading, reply here.

You should also receive a second email shortly with your current open opportunities — that's your starting snapshot. After that, updates come every Sunday evening.

Questions before then, reply to this email — comes straight to me.

Glad to have you,

David Duncan
Founder, Contractors Bid Prep
contractorbidprep.com`,
  };
}

const OPPORTUNITIES_DB_ID = 'dc9a3b8c-3f94-4f9c-a405-947e7f0f900f';
const MAX_BID_ITEMS_IN_EMAIL = 20;

// DemandStar's /app/suppliers/... bid links require a login. The
// /app/limited/... path serves the same bid details without one, so
// email recipients can open a link without hitting a login wall.
function toPublicDemandStarLink(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('demandstar.com')) {
      u.pathname = u.pathname.replace('/app/suppliers/bids/', '/app/limited/bids/');
      return u.toString();
    }
  } catch {
    // Not a valid absolute URL — leave it untouched.
  }
  return url;
}

async function fetchBidOpportunities() {
  const notionKey = process.env.NOTION_API_KEY;
  const response = await fetch(`https://api.notion.com/v1/databases/${OPPORTUNITIES_DB_ID}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: { property: 'Status', select: { equals: 'Open' } },
      sorts: [{ property: 'Due Date', direction: 'ascending' }],
      page_size: MAX_BID_ITEMS_IN_EMAIL,
    }),
  });
  if (!response.ok) throw new Error(`Notion Opportunities query responded ${response.status}`);
  const data = await response.json();

  return (data.results || []).map((page) => {
    const p = page.properties;
    return {
      opportunity_title: p['Opportunity Title']?.title?.map(t => t.plain_text).join('') || '',
      agency_name:       p['Agency']?.rich_text?.map(t => t.plain_text).join('') || '',
      due_date:          p['Due Date']?.date?.start || '',
      estimated_value:   p['Estimated Value']?.number ?? '',
      portal_link:       toPublicDemandStarLink(p['Portal Link']?.url || ''),
    };
  });
}

function formatBidsText(items) {
  return items
    .map(
      (item) =>
        `---\n${item.opportunity_title || '(No title)'}\nAgency: ${item.agency_name || '—'}\nDue: ${item.due_date || '—'}\nEst. Value: ${item.estimated_value || '—'}\nLink: ${item.portal_link || '—'}\n---`
    )
    .join('\n\n');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBidsHtml(items) {
  return items
    .map((item) => {
      const title = escapeHtml(item.opportunity_title || '(No title)');
      const titleHtml = item.portal_link
        ? `<a href="${escapeHtml(item.portal_link)}">${title}</a>`
        : title;
      return `---\n${titleHtml}\nAgency: ${escapeHtml(item.agency_name || '—')}\nDue: ${escapeHtml(item.due_date || '—')}\nEst. Value: ${escapeHtml(item.estimated_value || '—')}\n---`;
    })
    .join('\n\n');
}

function buildNoBidsEmail(toAddress, firstName) {
  return {
    from: 'David Duncan <davidduncan@contractorbidprep.com>',
    to: toAddress,
    subject: "No new bids this week — we're watching",
    text: `Hey ${firstName},

No matching bid opportunities came in this week for your trade and area. That happens sometimes — the pipeline runs every Sunday and we'll catch the next one.

If you think your filters need adjusting, reply here and I'll take a look.

— David
Contractor Bid Prep`,
  };
}

async function buildBidsEmail(toAddress, firstName) {
  let items;
  let fetchFailed = false;
  try {
    items = await fetchBidOpportunities();
  } catch (err) {
    console.warn('Notion Opportunities fetch failed, falling back to no-bids email:', err.message);
    fetchFailed = true;
  }

  if (fetchFailed || !Array.isArray(items) || items.length === 0) {
    if (!fetchFailed) console.warn('Notion Opportunities query returned no open items, sending no-bids fallback email');
    return buildNoBidsEmail(toAddress, firstName);
  }

  const intro = "Here's what's active right now. Your weekly alerts start this Sunday — you'll get updates like this every week automatically.";

  const body = `${intro}\n\n${formatBidsText(items)}`;
  const html = `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${escapeHtml(intro)}\n\n${formatBidsHtml(items)}</pre>`;

  return {
    from: 'David Duncan <davidduncan@contractorbidprep.com>',
    to: toAddress,
    subject: 'Current bid opportunities in your area',
    text: body,
    html,
  };
}

async function createNotionClientProfile(session) {
  const priceId = session.line_items?.data[0]?.price?.id;
  const tier = PRICE_TO_TIER[priceId] || 'Bronze';
  const portalToken = crypto.randomUUID();
  const customer = session.customer;
  const subscriptionId = session.subscription?.id || session.subscription || '';

  const phone = getCustomField(session, 'phone_number');
  const tradeValue = getCustomField(session, 'trade');
  const tradeLabel = TRADE_VALUE_TO_LABEL[tradeValue] || null;
  const licenseNumber = getCustomField(session, 'license_number');

  const properties = {
    'Contractor / Company': {
      title: [{ text: { content: customer.name || session.customer_details?.name || 'New Client' } }],
    },
    'Contact Email': { email: customer.email || session.customer_details?.email },
    Tier: { select: { name: tier } },
    'Subscription Status': { select: { name: 'Active' } },
    'Stripe Customer ID': { rich_text: [{ text: { content: customer.id } }] },
    'Stripe Subscription ID': {
      rich_text: [{ text: { content: subscriptionId } }],
    },
    'Portal Token': { rich_text: [{ text: { content: portalToken } }] },
    'Onboarding Date': { date: { start: new Date().toISOString().split('T')[0] } },
  };

  if (phone) properties['Contact Phone'] = { phone_number: phone };
  if (tradeLabel) properties['Trade(s)'] = { multi_select: [{ name: tradeLabel }] };
  if (licenseNumber) properties['License Number'] = { rich_text: [{ text: { content: licenseNumber } }] };

  await notion.pages.create({
    parent: { database_id: CLIENT_PROFILES_DB },
    properties,
  });

  console.log(`Created Notion profile for ${customer.email}, tier: ${tier}`);
}

async function markNotionSubscriptionCancelled(customerId) {
  const results = await notion.databases.query({
    database_id: CLIENT_PROFILES_DB,
    filter: { property: 'Stripe Customer ID', rich_text: { equals: customerId } },
  });

  if (results.results[0]) {
    await notion.pages.update({
      page_id: results.results[0].id,
      properties: {
        'Subscription Status': { select: { name: 'Cancelled' } },
      },
    });
    console.log(`Marked ${customerId} as Cancelled in Notion`);
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read request body' });
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = await stripe.checkout.sessions.retrieve(event.data.object.id, {
      expand: ['customer', 'subscription', 'line_items'],
    });

    try {
      await createNotionClientProfile(session);
    } catch (err) {
      console.error('Error creating Notion profile:', err.message);
      // Don't block email sending on a Notion failure — log and continue.
    }

    const toAddress = session.customer_email || session.customer_details?.email;
    const fullName = session.customer_details?.name || '';
    const firstName = fullName.split(' ')[0] || 'there';

    if (!toAddress) {
      console.warn('checkout.session.completed received with no customer email — skipping welcome email');
      return res.status(200).json({ received: true });
    }

    const { error } = await resend.emails.send(buildEmail(toAddress, firstName));
    if (error) {
      console.error('Failed to send welcome email:', error.message);
      return res.status(500).json({ error: 'Failed to send welcome email' });
    }

    console.log(`Welcome email sent to ${toAddress}`);

    // Send current bid opportunities (or no-bids fallback) — fire-and-forget, failures are non-fatal
    try {
      const bidsEmail = await buildBidsEmail(toAddress, firstName);
      const { error: bidsError } = await resend.emails.send(bidsEmail);
      if (bidsError) {
        console.warn('Failed to send bids email:', bidsError.message);
      } else {
        console.log(`Bids email sent to ${toAddress}`);
      }
    } catch (err) {
      console.warn('Bids email skipped due to error:', err.message);
    }
  } else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    let toAddress, firstName;

    try {
      await markNotionSubscriptionCancelled(subscription.customer);
    } catch (err) {
      console.error('Error updating Notion on cancellation:', err.message);
    }

    try {
      const customer = await stripe.customers.retrieve(subscription.customer);
      toAddress = customer.email;
      const fullName = customer.name || '';
      firstName = fullName.split(' ')[0] || null;
    } catch (err) {
      console.warn('Failed to retrieve Stripe customer for cancellation email:', err.message);
      return res.status(200).json({ received: true });
    }

    if (!toAddress) {
      console.warn('customer.subscription.deleted: no customer email found, skipping cancellation email');
      return res.status(200).json({ received: true });
    }

    const greeting = firstName ? `Hey ${firstName},` : 'Hello,';
    const { error: cancelError } = await resend.emails.send({
      from: 'David Duncan <davidduncan@contractorbidprep.com>',
      to: toAddress,
      subject: "You've been unsubscribed — Contractor Bid Prep",
      text: `${greeting}

Your Contractor Bid Prep subscription has been cancelled. You won't receive any further alerts.

If this was a mistake or you want to re-enroll, reply here or visit contractorbidprep.com.

Thanks for giving it a shot.

— David
Contractor Bid Prep`,
    });

    if (cancelError) {
      console.warn('Failed to send cancellation email:', cancelError.message);
    } else {
      console.log(`Cancellation email sent to ${toAddress}`);
    }
  }

  return res.status(200).json({ received: true });
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
