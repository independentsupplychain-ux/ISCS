/* ============================================================
   Vercel Serverless Function
   POST /api/cbp/webhook
   Stripe webhook handler — creates/updates Notion Client Profiles.

   Required env vars:
     STRIPE_SECRET_KEY
     STRIPE_WEBHOOK_SECRET
     NOTION_API_KEY
     BRONZE_MONTHLY_PRICE_ID
     SILVER_MONTHLY_PRICE_ID
     GOLD_MONTHLY_PRICE_ID
     BRONZE_ANNUAL_PRICE_ID
     SILVER_ANNUAL_PRICE_ID
     GOLD_ANNUAL_PRICE_ID

   STOP — After deploying, register this URL in Stripe:
     Dashboard -> Developers -> Webhooks -> Add endpoint
     URL: https://contractorbidprep.com/api/cbp/webhook
     Events: checkout.session.completed, customer.subscription.deleted
   ============================================================ */

const Stripe = require('stripe');
const { Client } = require('@notionhq/client');
const { buffer } = require('micro');
const crypto = require('crypto');

// Disable Vercel's default body parser so we can read raw bytes for signature verification
const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
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

  // Verify Stripe signature
  const sig = req.headers['stripe-signature'];
  const buf = await buffer(req);
  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  // Handle checkout completed — create Notion client profile
  if (event.type === 'checkout.session.completed') {
    try {
      const session = await stripe.checkout.sessions.retrieve(event.data.object.id, {
        expand: ['customer', 'subscription', 'line_items'],
      });

      const priceId = session.line_items?.data[0]?.price?.id;
      const tier = PRICE_TO_TIER[priceId] || 'Bronze';
      const portalToken = crypto.randomUUID();
      const customer = session.customer;

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
            rich_text: [{ text: { content: session.subscription || '' } }],
          },
          'Portal Token': { rich_text: [{ text: { content: portalToken } }] },
          'Onboarding Date': { date: { start: new Date().toISOString().split('T')[0] } },
        },
      });

      console.log(`Created Notion profile for ${customer.email}, tier: ${tier}`);
    } catch (err) {
      console.error('Error creating Notion profile:', err.message);
      // Return 200 to prevent Stripe from retrying — log the error instead
    }
  }

  // Handle subscription cancelled — mark Notion record as Cancelled
  if (event.type === 'customer.subscription.deleted') {
    try {
      const customerId = event.data.object.customer;
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
    } catch (err) {
      console.error('Error updating Notion on cancellation:', err.message);
    }
  }

  return res.status(200).json({ received: true });
};

handler.config = { api: { bodyParser: false } };
module.exports = handler;
