/* ============================================================
   Vercel Serverless Function
   POST /api/cbp/create-checkout-session
   Body: { plan: 'bronze' | 'silver' | 'gold' }
   Returns: { url: <stripe checkout url> }

   Required env vars (set in Vercel project settings):
     STRIPE_SECRET_KEY
     STRIPE_PRICE_BRONZE
     STRIPE_PRICE_SILVER
     STRIPE_PRICE_GOLD
     NEXT_PUBLIC_SITE_URL  (or VERCEL_URL fallback)
   ============================================================ */

const Stripe = require('stripe');

const PRICE_MAP = {
  bronze: process.env.STRIPE_PRICE_BRONZE,
  silver: process.env.STRIPE_PRICE_SILVER,
  gold:   process.env.STRIPE_PRICE_GOLD,
};

module.exports = async (req, res) => {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { plan } = req.body || {};

  if (!plan || !PRICE_MAP[plan]) {
    return res.status(400).json({ error: 'Invalid plan. Must be bronze, silver, or gold.' });
  }

  const priceId = PRICE_MAP[plan];
  if (!priceId) {
    return res.status(500).json({ error: `Price ID for plan "${plan}" is not configured. Run the Stripe setup script.` });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe secret key not configured.' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/contractorbidprep/portal/login.html?checkout=success&plan=${plan}`,
      cancel_url:  `${siteUrl}/contractorbidprep/index.html?checkout=cancelled`,
      metadata: { plan },
      subscription_data: {
        metadata: { plan },
      },
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
