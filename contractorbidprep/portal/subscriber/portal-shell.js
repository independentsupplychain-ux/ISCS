/* ============================================================
   CBP Subscriber Portal — shared shell
   Handles token resolution, tier-gated auth, and sidebar nav
   for all /portal/* subscriber pages.

   Token model matches the rest of the site: no cookies/sessions
   server-side. The Portal Token travels as a URL query param and
   is cached in sessionStorage so in-portal navigation keeps it.
   ============================================================ */

const CBP_PORTAL_SECTIONS = [
  {
    key: 'templates',
    label: 'Bid Templates',
    href: '/portal/templates',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
  },
  {
    key: 'market-intel',
    label: 'Market Intel',
    href: '/portal/market-intel',
    icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  },
  {
    key: 'how-tos',
    label: 'How-Tos',
    href: '/portal/how-tos',
    icon: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  },
  {
    key: 'contacts',
    label: 'Business Contacts',
    href: '/portal/contacts',
    icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  },
  {
    key: 'opportunities',
    label: 'Open Opportunities',
    href: '/portal/opportunities',
    icon: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    soon: true,
  },
];

const TOKEN_STORAGE_KEY = 'cbp_subscriber_token';

function cbpGetToken() {
  const urlToken = new URLSearchParams(window.location.search).get('token');
  if (urlToken) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, urlToken);
    return urlToken;
  }
  return sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

function cbpWithToken(href) {
  const token = cbpGetToken();
  if (!token) return href;
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}token=${encodeURIComponent(token)}`;
}

function cbpEsc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cbpRenderSidebar(activeKey) {
  const nav = document.getElementById('portal-nav');
  if (!nav) return;
  nav.innerHTML = CBP_PORTAL_SECTIONS.map(s => `
    <a href="${cbpWithToken(s.href)}" class="portal-nav-link${s.key === activeKey ? ' active' : ''}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
      <span>${cbpEsc(s.label)}</span>
      ${s.soon ? '<span class="portal-nav-soon">Soon</span>' : ''}
    </a>
  `).join('');
}

function cbpShowDenied() {
  const loading = document.getElementById('portal-loading');
  const denied = document.getElementById('portal-denied');
  if (loading) loading.style.display = 'none';
  if (denied) denied.style.display = 'flex';
}

async function cbpOpenBillingPortal(customerId) {
  if (!customerId) return;
  try {
    const res = await fetch('/api/cbp/customer-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId }),
    });
    const { url, error } = await res.json();
    if (error || !url) throw new Error(error || 'No billing portal URL returned');
    window.location.href = url;
  } catch (err) {
    console.error('Billing portal error:', err);
    alert('Something went wrong opening billing. Please contact hello@contractorbidprep.com.');
  }
}

/**
 * Boots the shared portal shell for a given page.
 * activeKey: which nav section is active ('templates', 'market-intel', etc.)
 * Returns the resolved subscriber { name, email, tier, stripeCustomerId } via callback,
 * or redirects to /portal/upgrade if the subscriber isn't Silver/Gold.
 */
async function cbpInitPortal(activeKey, onReady) {
  cbpRenderSidebar(activeKey);

  const token = cbpGetToken();
  if (!token) {
    cbpShowDenied();
    return;
  }

  try {
    const res = await fetch(`/api/cbp/portal-auth?token=${encodeURIComponent(token)}`);

    if (res.status === 404) {
      cbpShowDenied();
      return;
    }
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    const subscriber = await res.json();

    // Auth gate: only Silver and Gold reach the portal. Bronze (and any
    // account with no active recognized tier) is redirected to the
    // upgrade prompt rather than shown a denial screen.
    if (subscriber.tier !== 'Silver' && subscriber.tier !== 'Gold') {
      window.location.href = cbpWithToken('/portal/upgrade');
      return;
    }

    document.getElementById('portal-loading').style.display = 'none';
    document.getElementById('portal-shell').style.display = 'flex';

    const nameEl = document.getElementById('portal-user-name');
    if (nameEl) nameEl.textContent = subscriber.name || '';

    const tierEl = document.getElementById('portal-tier-badge');
    if (tierEl) {
      tierEl.textContent = subscriber.tier;
      tierEl.className = `tier-badge tier-${subscriber.tier.toLowerCase()}`;
    }

    const manageLink = document.getElementById('portal-manage-link');
    if (manageLink && subscriber.stripeCustomerId) {
      manageLink.style.display = 'block';
      manageLink.onclick = (e) => {
        e.preventDefault();
        cbpOpenBillingPortal(subscriber.stripeCustomerId);
      };
    }

    if (typeof onReady === 'function') onReady(subscriber);

  } catch (err) {
    console.error('Portal auth error:', err);
    cbpShowDenied();
  }
}
