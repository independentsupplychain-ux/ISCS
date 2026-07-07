/* ============================================================
   Vercel Serverless Function
   POST /api/cbp/create-checkout-session
   Body: { priceId: string, mode?: 'subscription' | 'payment' }
   Returns: { url: <stripe checkout url> }

   Required env vars (set in Vercel project settings):
     STRIPE_SECRET_KEY
   ============================================================ */

const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { priceId, mode } = req.body || {};

  if (!priceId) {
    return res.status(400).json({ error: 'priceId is required' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: mode || 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      billing_address_collection: 'required',
      allow_promotion_codes: true,
      custom_fields: [
        {
          key: 'phone_number',
          label: { type: 'custom', custom: 'Mobile phone (for bid alerts)' },
          type: 'text',
          text: { minimum_length: 7, maximum_length: 20 },
          optional: false,
        },
        {
          key: 'trade',
          label: { type: 'custom', custom: 'Trade' },
          type: 'dropdown',
          dropdown: {
            options: [
              { label: 'Roofing', value: 'roofing' },
              { label: 'General Contracting', value: 'generalContracting' },
              { label: 'HVAC', value: 'hvac' },
              { label: 'Electrical', value: 'electrical' },
              { label: 'Plumbing', value: 'plumbing' },
              { label: 'Other', value: 'other' },
            ],
          },
          optional: false,
        },
        {
          key: 'license_number',
          label: { type: 'custom', custom: 'FL/AL contractor license number' },
          type: 'text',
          optional: false,
        },
      ],
      success_url: 'https://contractorbidprep.com/contractorbidprep/portal/welcome.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://contractorbidprep.com/contractorbidprep/index.html#pricing',
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
