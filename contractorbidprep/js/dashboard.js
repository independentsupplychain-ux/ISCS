/* ============================================================
   Contractors Bid Prep — Dashboard JS
   Reads ?token= from URL, calls /api/cbp/portal-data,
   renders opportunities, bid history (Gold), and subscription mgmt.
   ============================================================ */

// ---- Helpers ----

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(val) {
  if (val === null || val === undefined || val === '') return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(val);
}

function statusBadge(status) {
  if (!status) return '';
  const cls = status === 'Submitted'     ? 'status-submitted'
             : status === 'Review Needed' ? 'status-review'
             : 'status-no-response';
  return `<span class="status-badge ${cls}">${escHtml(status)}</span>`;
}

function showState(state) {
  document.getElementById('state-loading').style.display = state === 'loading' ? 'flex'  : 'none';
  document.getElementById('state-error').style.display   = state === 'error'   ? 'block' : 'none';
  document.getElementById('state-content').style.display = state === 'content' ? 'block' : 'none';
}

// ---- Token ----

const params = new URLSearchParams(window.location.search);
const token  = params.get('token');

// ---- Load portal data ----

let stripeCustomerId = null;

async function loadDashboard() {
  showState('loading');

  if (!token) {
    showState('error');
    return;
  }

  try {
    const res = await fetch(`/api/cbp/portal-data?token=${encodeURIComponent(token)}`);

    if (res.status === 401) {
      showState('error');
      return;
    }

    if (!res.ok) {
      throw new Error(`Server error ${res.status}`);
    }

    const { contractor, opportunities, threads } = await res.json();

    stripeCustomerId = contractor.stripeCustomerId;

    // Populate header
    const firstName = (contractor.name || '').split(' ')[0];
    document.getElementById('welcome-name').textContent      = firstName || contractor.name || '—';
    document.getElementById('user-name-display').textContent = contractor.name || '';
    document.getElementById('user-avatar').textContent       = firstName ? firstName[0].toUpperCase() : '?';

    if (contractor.tier) {
      document.getElementById('tier-badge-header').innerHTML =
        `<span class="tier-badge">${escHtml(contractor.tier)}</span>`;
    }

    // Render opportunities
    renderOpportunities(opportunities);

    // Render bid history (Gold only)
    if (threads && threads.length > 0) {
      renderBidHistory(threads);
      document.getElementById('bid-history-section').style.display = 'block';
    }

    showState('content');

  } catch (err) {
    console.error('Dashboard error:', err);
    showState('error');
  }
}

// ---- Render opportunities ----

function renderOpportunities(opps) {
  const container = document.getElementById('opps-container');

  if (!opps || opps.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        No open opportunities match your trade and service area right now.
        Check back after Sunday's scan.
      </div>`;
    return;
  }

  container.innerHTML = opps.map(opp => `
    <div class="opp-card">
      <div class="opp-card-body">
        <div class="opp-title">${escHtml(opp.title || 'Untitled Opportunity')}</div>
        <div class="opp-meta">
          <span>${escHtml(opp.agency || '—')}</span>
          <span>Due: ${formatDate(opp.dueDate)}</span>
          <span>Est. ${formatCurrency(opp.estimatedValue)}</span>
        </div>
      </div>
      ${opp.portalLink
        ? `<a href="${escHtml(opp.portalLink)}" target="_blank" rel="noopener" class="opp-link">View bid &rarr;</a>`
        : ''}
    </div>
  `).join('');
}

// ---- Render bid history ----

function renderBidHistory(threads) {
  const container = document.getElementById('bid-history-container');
  container.innerHTML = threads.map(t => `
    <div class="bid-history-row">
      <div>
        <div class="bid-opp-name">${escHtml(t.opportunity || '—')}</div>
        <div class="opp-meta"><span>${escHtml(t.agency || '—')}</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:1rem;">
        <span class="bid-amount">${t.bidAmount ? formatCurrency(t.bidAmount) : '—'}</span>
        ${statusBadge(t.status)}
      </div>
    </div>
  `).join('');
}

// ---- Manage subscription ----

async function openBillingPortal() {
  if (!stripeCustomerId) return;

  const btn = document.getElementById('manage-btn');
  btn.disabled = true;
  btn.textContent = 'Redirecting...';

  try {
    const res = await fetch('/api/cbp/customer-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: stripeCustomerId }),
    });
    const { url, error } = await res.json();
    if (error) throw new Error(error);
    window.location.href = url;
  } catch (err) {
    console.error('Billing portal error:', err);
    btn.disabled = false;
    btn.textContent = 'Manage subscription';
    alert('Something went wrong. Please try again or contact hello@contractorbidprep.com.');
  }
}

// ---- Init ----
loadDashboard();
