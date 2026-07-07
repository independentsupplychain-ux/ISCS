/* ============================================================
   Vercel Serverless Function
   GET /api/cbp/session-token?session_id=xxx
   Resolves a Stripe Checkout Session to the Notion Portal Token
   created by the webhook, for the post-checkout welcome page.

   Required env vars:
     STRIPE_SECRET_KEY
     NOTION_API_KEY
   ============================================================ */

const Stripe = require('stripe');
const { Client } = require('@notionhq/client');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const notion = new Client({ auth: process.env.NOTION_API_KEY });

const CLIENT_PROFILES_DB = '948368a5-466a-4bf8-affb-083b7e8977d5';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id is required' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['customer'],
    });

    const customerId = session.customer?.id || session.customer;
    if (!customerId) {
      return res.status(404).json({ error: 'No customer found for this session' });
    }

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      const results = await notion.databases.query({
        database_id: CLIENT_PROFILES_DB,
        filter: { property: 'Stripe Customer ID', rich_text: { equals: customerId } },
      });

      const profile = results.results[0];
      if (profile) {
        const pp = profile.properties;
        const token = pp['Portal Token']?.rich_text?.map(t => t.plain_text).join('') || '';
        if (token) {
          return res.status(200).json({
            token,
            name: pp['Contractor / Company']?.title?.map(t => t.plain_text).join('') || '',
            email: pp['Contact Email']?.email || '',
            phone: pp['Contact Phone']?.phone_number || '',
            trades: pp['Trade(s)']?.multi_select?.map(o => o.name) || [],
            licenseNumber: pp['License Number']?.rich_text?.map(t => t.plain_text).join('') || '',
          });
        }
      }

      if (attempt < RETRY_ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }

    return res.status(202).json({ error: 'Account is still being set up, try again shortly' });

  } catch (err) {
    console.error('session-token error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
