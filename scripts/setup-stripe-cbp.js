#!/usr/bin/env node
/* ============================================================
   Stripe Product & Price Setup for Contractors Bid Prep
   Run once: node scripts/setup-stripe-cbp.js

   Requires:  STRIPE_SECRET_KEY in environment
   Output:    Prints price IDs to add to Vercel env vars
   ============================================================ */

const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('\nERROR: STRIPE_SECRET_KEY environment variable is not set.');
  console.error('Run: STRIPE_SECRET_KEY=sk_... node scripts/setup-stripe-cbp.js\n');
  process.exit(1);
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = [
  {
    key:         'bronze',
    envVar:      'STRIPE_PRICE_BRONZE',
    name:        'CBP Bronze',
    description: 'Weekly bid monitoring & SMS alerts for the solo trade contractor.',
    amount:      10000,  // $100.00 in cents
  },
  {
    key:         'silver',
    envVar:      'STRIPE_PRICE_SILVER',
    name:        'CBP Silver',
    description: 'Full bid automation: alerts, document generation, e-signature workflow.',
    amount:      35000,  // $350.00
  },
  {
    key:         'gold',
    envVar:      'STRIPE_PRICE_GOLD',
    name:        'CBP Gold',
    description: 'Full-service bid management with unlimited coverage & priority support.',
    amount:      85000,  // $850.00
  },
];

async function setup() {
  console.log('\nSetting up Stripe products & prices for Contractors Bid Prep...\n');

  const results = [];

  for (const plan of PLANS) {
    process.stdout.write(`Creating product: ${plan.name} ... `);

    const product = await stripe.products.create({
      name:        plan.name,
      description: plan.description,
      metadata:    { plan: plan.key, service: 'contractorbidprep' },
    });

    const price = await stripe.prices.create({
      product:    product.id,
      unit_amount: plan.amount,
      currency:   'usd',
      recurring:  { interval: 'month' },
      metadata:   { plan: plan.key },
    });

    console.log(`done.`);
    console.log(`  Product ID: ${product.id}`);
    console.log(`  Price ID:   ${price.id}`);

    results.push({ ...plan, productId: product.id, priceId: price.id });
  }

  console.log('\n=== Add these to Vercel Environment Variables ===\n');
  for (const r of results) {
    console.log(`${r.envVar}=${r.priceId}`);
  }
  console.log('\nAlso confirm these are set:');
  console.log('STRIPE_SECRET_KEY=sk_...');
  console.log('NEXT_PUBLIC_SITE_URL=https://your-vercel-domain.com');
  console.log('NOTION_API_KEY=secret_...');
  console.log('NOTION_BID_DB_ID=356e9419-6897-81df-8754-e4729d6ceaae');
  console.log('\nDone.\n');
}

setup().catch(err => {
  console.error('\nStripe setup failed:', err.message);
  process.exit(1);
});
