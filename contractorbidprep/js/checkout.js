/* ============================================================
   Contractors Bid Prep — Stripe Checkout (client-side)
   Calls /api/cbp/create-checkout-session with priceId + mode,
   then redirects to Stripe's hosted checkout page.
   ============================================================ */

async function handleCheckout(priceId, mode = 'subscription') {
  try {
    // Disable all checkout buttons during redirect
    document.querySelectorAll('[onclick^="handleCheckout"]').forEach(btn => {
      btn.disabled = true;
    });

    const res = await fetch('/api/cbp/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId, mode }),
    });

    const { url, error } = await res.json();

    if (error) throw new Error(error);
    if (!url)  throw new Error('No checkout URL returned.');

    window.location.href = url;

  } catch (err) {
    console.error('Checkout error:', err);

    document.querySelectorAll('[onclick^="handleCheckout"]').forEach(btn => {
      btn.disabled = false;
    });

    showToast('Something went wrong. Please try again or email hello@contractorbidprep.com.', true);
  }
}

// ---- Billing toggle ----

function setBilling(period) {
  const isAnnual = period === 'annual';

  document.querySelectorAll('.billing-monthly').forEach(el => {
    el.style.display = isAnnual ? 'none' : '';
  });
  document.querySelectorAll('.billing-annual').forEach(el => {
    el.style.display = isAnnual ? '' : 'none';
  });

  document.getElementById('toggle-monthly').classList.toggle('active', !isAnnual);
  document.getElementById('toggle-annual').classList.toggle('active', isAnnual);
}

// ---- Toast ----

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');

  setTimeout(() => toast.classList.remove('show'), 4500);
}
