/* ============================================================
   Vercel Serverless Function
   GET /api/cbp/portal-auth?token=XXX
   Resolves a Subscriber Portal token to identity + tier for the
   CBP Subscriber Portal (Bid Templates / Market Intel / How-Tos /
   Business Contacts / Open Opportunities).

   Tier is resolved live from Stripe (source of truth) — the only
   Notion interaction is the existing read-only Portal Token ->
   Stripe Customer ID lookup already used by session-token.js and
   portal-data.js. No Notion writes, no schema changes.

   Required env vars:
     STRIPE_SECRET_KEY
     NOTION_API_KEY
     STRIPE_PRICE_BRONZE, STRIPE_PRICE_SILVER, STRIPE_PRICE_GOLD
     STRIPE_PRICE_BRONZE_ANNUAL, STRIPE_PRICE_SILVER_ANNUAL, STRIPE_PRICE_GOLD_ANNUAL

   Falls back to mock data (token "demo-roofing-2025") if
   NOTION_API_KEY or STRIPE_SECRET_KEY are absent, so the portal
   shell can be built/tested before both keys are live.
   ============================================================ */

const Stripe = require('stripe');
const { Client } = require('@notionhq/client');

const CLIENT_PROFILES_DB = process.env.NOTION_CLIENT_PROFILES_DB_ID || '4ad603ac-a8c0-4282-ae1b-4d898abd15e7';

const PRICE_TO_TIER = {
  [process.env.STRIPE_PRICE_BRONZE]: 'Bronze',
  [process.env.STRIPE_PRICE_SILVER]: 'Silver',
  [process.env.STRIPE_PRICE_GOLD]: 'Gold',
  [process.env.STRIPE_PRICE_BRONZE_ANNUAL]: 'Bronze',
  [process.env.STRIPE_PRICE_SILVER_ANNUAL]: 'Silver',
  [process.env.STRIPE_PRICE_GOLD_ANNUAL]: 'Gold',
};

const MOCK_TOKEN = 'demo-roofing-2025';
const MOCK_SUBSCRIBERS = {
  'demo-roofing-2025': { name: 'Gulf Coast Roofing LLC', email: 'info@gulfcoastroofing.com', tier: 'Silver', stripeCustomerId: null },
  'demo-gold-2025': { name: 'Panhandle General Contracting', email: 'info@panhandlegc.com', tier: 'Gold', stripeCustomerId: null },
  'demo-bronze-2025': { name: 'Coastal HVAC Services', email: 'info@coastalhvac.com', tier: 'Bronze', stripeCustomerId: null },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'Missing token' });
  }
  const cleanToken = token.trim();

  const hasNotion = !!process.env.NOTION_API_KEY;
  const hasStripe = !!process.env.STRIPE_SECRET_KEY;

  // ---- Mock mode (no live keys configured yet) ----
  if (!hasNotion || !hasStripe) {
    const mock = MOCK_SUBSCRIBERS[cleanToken];
    if (!mock) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json({ ...mock, mock: true });
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    // 1. Resolve token -> Stripe Customer ID (read-only, pre-existing field)
    const results = await notion.databases.query({
      database_id: CLIENT_PROFILES_DB,
      filter: { property: 'Portal Token', rich_text: { equals: cleanToken } },
    });

    const profile = results.results[0];
    if (!profile) return res.status(404).json({ error: 'not_found' });

    const pp = profile.properties;
    const name = pp['Contractor / Company']?.title?.map(t => t.plain_text).join('') || '';
    const email = pp['Contact Email']?.email || '';
    const customerId = pp['Stripe Customer ID']?.rich_text?.map(t => t.plain_text).join('') || '';

    if (!customerId) return res.status(404).json({ error: 'not_found' });

    // 2. Live tier lookup from Stripe — source of truth, not the cached Notion field
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      expand: ['data.items.data.price'],
      limit: 10,
    });

    let tier = null;
    for (const sub of subs.data) {
      for (const item of sub.items.data) {
        const mapped = PRICE_TO_TIER[item.price?.id];
        if (mapped) { tier = mapped; break; }
      }
      if (tier) break;
    }

    // No active subscription matching a known price -> treat as no paid access
    return res.status(200).json({
      name,
      email,
      tier: tier || 'Bronze',
      stripeCustomerId: customerId,
      mock: false,
    });

  } catch (err) {
    console.error('portal-auth error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
