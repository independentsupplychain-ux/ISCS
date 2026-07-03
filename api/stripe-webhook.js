// Required Vercel environment variables:
//   STRIPE_WEBHOOK_SECRET  — signing secret from the Stripe Webhooks dashboard
//   STRIPE_SECRET_KEY      — Stripe secret key
//   RESEND_API_KEY         — API key from resend.com
//   NOTION_API_KEY         — Notion internal integration token
//   APIFY_ACTOR_ID         — Apify actor ID for the DemandStar scraper
//   APIFY_API_TOKEN        — Apify API token
//   BRONZE_MONTHLY_PRICE_ID, SILVER_MONTHLY_PRICE_ID, GOLD_MONTHLY_PRICE_ID
//   BRONZE_ANNUAL_PRICE_ID, SILVER_ANNUAL_PRICE_ID, GOLD_ANNUAL_PRICE_ID
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
const CLIENT_PROFILES_DB = '4ad603ac-a8c0-4282-ae1b-4d898abd15e7';

const PRICE_TO_TIER = {
  [process.env.BRONZE_MONTHLY_PRICE_ID]: 'Bronze',
  [process.env.SILVER_MONTHLY_PRICE_ID]: 'Silver',
  [process.env.GOLD_MONTHLY_PRICE_ID]:   'Gold',
  [process.env.BRONZE_ANNUAL_PRICE_ID]:  'Bronze',
  [process.env.SILVER_ANNUAL_PRICE_ID]:  'Silver',
  [process.env.GOLD_ANNUAL_PRICE_ID]:    'Gold',
};

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

async function fetchBidOpportunities() {
  const actorId = process.env.APIFY_ACTOR_ID;
  const token = process.env.APIFY_API_TOKEN;
  const url = `https://api.apify.com/v2/acts/${actorId}/runs/last/dataset/items?token=${token}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Apify responded ${response.status}`);
  return response.json();
}

function formatBidsText(items) {
  return items
    .map(
      (item) =>
        `---\n${item.opportunity_title || '(No title)'}\nAgency: ${item.agency_name || '—'}\nDue: ${item.due_date || '—'}\nEst. Value: ${item.estimated_value || '—'}\nLink: ${item.portal_link || '—'}\n---`
    )
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
    console.warn('Apify fetch failed, falling back to no-bids email:', err.message);
    fetchFailed = true;
  }

  if (fetchFailed || !Array.isArray(items) || items.length === 0) {
    if (!fetchFailed) console.warn('Apify returned no bid items, sending no-bids fallback email');
    return buildNoBidsEmail(toAddress, firstName);
  }

  const body =
    "Here's what's active right now. Your weekly alerts start this Sunday — you'll get updates like this every week automatically.\n\n" +
    formatBidsText(items);

  return {
    from: 'David Duncan <davidduncan@contractorbidprep.com>',
    to: toAddress,
    subject: 'Current bid opportunities in your area',
    text: body,
  };
}

async function createNotionClientProfile(session) {
  const priceId = session.line_items?.data[0]?.price?.id;
  const tier = PRICE_TO_TIER[priceId] || 'Bronze';
  const portalToken = crypto.randomUUID();
  const customer = session.customer;
  const subscriptionId = session.subscription?.id || session.subscription || '';

  await notion.pages.create({
    parent: { database_id: CLIENT_PROFILES_DB },
    properties: {
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
    },
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
