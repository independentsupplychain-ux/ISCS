/* ============================================================
   Vercel Serverless Function
   POST /api/cbp/customer-portal
   Body: { customerId: string }
   Returns: { url: <stripe billing portal url> }

   Required env vars:
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

  const { customerId } = req.body || {};

  if (!customerId) {
    return res.status(400).json({ error: 'customerId is required' });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: 'https://contractorbidprep.com/contractorbidprep/portal/dashboard.html',
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe billing portal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
