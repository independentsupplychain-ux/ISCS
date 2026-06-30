// Required Vercel environment variables:
//   STRIPE_WEBHOOK_SECRET  — signing secret from the Stripe Webhooks dashboard
//   STRIPE_SECRET_KEY      — Stripe secret key
//   RESEND_API_KEY         — API key from resend.com
//
// contractorbidprep.com must be verified as a sending domain in the Resend dashboard
// before emails will deliver.
//
// Register this endpoint in the Stripe dashboard under Developers → Webhooks:
//   https://contractorbidprep.com/api/stripe-webhook

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');

export const config = { api: { bodyParser: false } };

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

Your first alert goes out Sunday evening. Questions before then, reply to this email — comes straight to me.

Glad to have you,

David Duncan
Founder, Contractors Bid Prep
contractorbidprep.com`,
  };
}

export default async function handler(req, res) {
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
    const session = event.data.object;
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
  }

  return res.status(200).json({ received: true });
}
