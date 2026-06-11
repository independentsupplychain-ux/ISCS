/* ============================================================
   Contractors Bid Prep — Stripe Checkout (client-side)
   Calls /api/cbp/create-checkout-session, then redirects
   to Stripe's hosted checkout page.
   ============================================================ */

const PLAN_LABELS = {
  bronze: 'Bronze — $100/mo',
  silver: 'Silver — $350/mo',
  gold:   'Gold — $850/mo',
};

async function startCheckout(plan) {
  if (!PLAN_LABELS[plan]) return;

  const btn = document.querySelector(`[data-plan="${plan}"]`);
  const originalText = btn ? btn.textContent : '';

  try {
    // Loading state
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Redirecting...';
    }

    const res = await fetch('/api/cbp/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const { url } = await res.json();

    if (!url) throw new Error('No checkout URL returned from server.');

    // Redirect to Stripe Checkout
    window.location.href = url;

  } catch (err) {
    console.error('Checkout error:', err);
    showToast('Something went wrong. Please try again or email us.', true);

    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');

  setTimeout(() => toast.classList.remove('show'), 4500);
}
