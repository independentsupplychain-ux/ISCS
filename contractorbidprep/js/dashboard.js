/* ============================================================
   Contractors Bid Prep — Dashboard JS
   Handles auth guard, loads bid data from /api/cbp/bids,
   renders the table and stat cards.
   ============================================================ */

// ---- Auth guard ----
const contractor = sessionStorage.getItem('cbp_contractor');
const auth       = sessionStorage.getItem('cbp_auth');

if (!auth || !contractor) {
  window.location.replace('login.html');
}

// ---- Populate header ----
const firstName = contractor ? contractor.split(' ')[0] : '';
document.getElementById('welcome-name').textContent    = firstName;
document.getElementById('user-name-display').textContent = contractor || '';
document.getElementById('user-avatar').textContent     = firstName ? firstName[0].toUpperCase() : '?';

// ---- Status helpers ----
const STATUS_CLASS = {
  'submitted':   'status-submitted',
  'pending':     'status-pending',
  'no response': 'status-no-response',
  'awarded':     'status-awarded',
};

function statusClass(status) {
  const key = (status || '').toLowerCase().trim();
  return STATUS_CLASS[key] || 'status-no-response';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(val) {
  if (val === null || val === undefined || val === '') return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

// ---- Load bids ----
async function loadBids() {
  showState('loading');

  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.classList.add('spinning');

  try {
    const url = `/api/cbp/bids?contractor=${encodeURIComponent(contractor)}`;
    const res  = await fetch(url);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const { bids } = await res.json();
    renderBids(bids);
    updateStats(bids);
    updateLastScan();

  } catch (err) {
    console.error('Dashboard load error:', err);
    showState('error');
    document.getElementById('error-msg').textContent = err.message || 'Could not load bids.';
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

function renderBids(bids) {
  if (!bids || bids.length === 0) {
    showState('empty');
    return;
  }

  const tbody = document.getElementById('bids-tbody');
  tbody.innerHTML = '';

  bids.forEach(bid => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="bid-title">${escHtml(bid.opportunity || 'Untitled Opportunity')}</div>
        ${bid.bidAmount ? `<div class="bid-agency">Bid: ${formatCurrency(bid.bidAmount)}</div>` : ''}
      </td>
      <td>
        <div>${escHtml(bid.agency || '—')}</div>
      </td>
      <td>${formatDate(bid.dueDate)}</td>
      <td>
        <span class="status-pill ${statusClass(bid.status)}">
          ${escHtml(bid.status || 'Unknown')}
        </span>
      </td>
      <td>${escHtml(bid.source || '—')}</td>
    `;
    tbody.appendChild(row);
  });

  showState('table');
}

function updateStats(bids) {
  const counts = { submitted: 0, pending: 0, 'no response': 0 };

  bids.forEach(b => {
    const key = (b.status || '').toLowerCase().trim();
    if (counts[key] !== undefined) counts[key]++;
  });

  document.getElementById('stat-total').textContent       = bids.length;
  document.getElementById('stat-submitted').textContent   = counts['submitted'];
  document.getElementById('stat-pending').textContent     = counts['pending'];
  document.getElementById('stat-no-response').textContent = counts['no response'];
}

function updateLastScan() {
  const el = document.getElementById('last-scan');
  if (el) el.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

// ---- UI state helpers ----
function showState(state) {
  document.getElementById('loading-state').style.display = state === 'loading' ? 'flex'  : 'none';
  document.getElementById('bids-table').style.display    = state === 'table'   ? 'table' : 'none';
  document.getElementById('empty-state').style.display   = state === 'empty'   ? 'block' : 'none';
  document.getElementById('error-state').style.display   = state === 'error'   ? 'block' : 'none';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Logout ----
function logout() {
  sessionStorage.removeItem('cbp_contractor');
  sessionStorage.removeItem('cbp_auth');
  window.location.href = 'login.html';
}

// ---- Init ----
loadBids();
