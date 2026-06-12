/* ============================================================
   Contractors Bid Prep — Dashboard JS
   Loads open bid opportunities from /api/cbp/bids,
   renders the table with "New This Week" badges and stat cards.
   ============================================================ */

// ---- Auth guard ----
const contractor = sessionStorage.getItem('cbp_contractor');
const auth       = sessionStorage.getItem('cbp_auth');

if (!auth || !contractor) {
  window.location.replace('login.html');
}

// ---- Populate header ----
const firstName = contractor ? contractor.split(' ')[0] : '';
document.getElementById('welcome-name').textContent      = firstName;
document.getElementById('user-name-display').textContent = contractor || '';
document.getElementById('user-avatar').textContent       = firstName ? firstName[0].toUpperCase() : '?';

// ---- Date helpers ----
function today() {
  return new Date().toISOString().slice(0, 10);  // "YYYY-MM-DD"
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(val) {
  if (val === null || val === undefined || val === '' || val === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(val);
}

// "New This Week" = First Seen within the last 7 days
function isNewThisWeek(firstSeenStr) {
  if (!firstSeenStr) return false;
  const sevenDaysAgo = addDays(today(), -7);
  return firstSeenStr >= sevenDaysAgo;
}

function isDueSoon(dueDateStr, days) {
  if (!dueDateStr) return false;
  const cutoff = addDays(today(), days);
  return dueDateStr >= today() && dueDateStr <= cutoff;
}

// ---- Load bids ----
async function loadBids() {
  showState('loading');

  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.classList.add('spinning');

  try {
    const res = await fetch('/api/cbp/bids');

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

// ---- Render table ----
function renderBids(bids) {
  if (!bids || bids.length === 0) {
    showState('empty');
    return;
  }

  const tbody = document.getElementById('bids-tbody');
  tbody.innerHTML = '';

  bids.forEach(bid => {
    const isNew = isNewThisWeek(bid.firstSeen);
    const trades = Array.isArray(bid.tradeCategory) ? bid.tradeCategory : [];

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="bid-title-cell">
          ${bid.portalLink
            ? `<a href="${escHtml(bid.portalLink)}" target="_blank" rel="noopener" class="bid-title-link">${escHtml(bid.opportunity || 'Untitled Opportunity')}</a>`
            : `<span class="bid-title">${escHtml(bid.opportunity || 'Untitled Opportunity')}</span>`
          }
          ${isNew ? '<span class="new-badge">New This Week</span>' : ''}
        </div>
      </td>
      <td>${escHtml(bid.agency || '—')}</td>
      <td>${formatDate(bid.dueDate)}</td>
      <td>${formatCurrency(bid.estimatedValue)}</td>
      <td>
        <div class="trade-pills">
          ${trades.map(t => `<span class="trade-pill">${escHtml(t)}</span>`).join('')}
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });

  showState('table');
}

// ---- Stat cards ----
function updateStats(bids) {
  const t = today();
  const in7  = addDays(t, 7);
  const in30 = addDays(t, 30);

  let newCount      = 0;
  let dueSoon7      = 0;
  let dueSoon30     = 0;

  bids.forEach(b => {
    if (isNewThisWeek(b.firstSeen)) newCount++;
    if (isDueSoon(b.dueDate, 7))  dueSoon7++;
    if (isDueSoon(b.dueDate, 30)) dueSoon30++;
  });

  document.getElementById('stat-total').textContent     = bids.length;
  document.getElementById('stat-new').textContent       = newCount;
  document.getElementById('stat-due-soon').textContent  = dueSoon7;
  document.getElementById('stat-due-month').textContent = dueSoon30;
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
