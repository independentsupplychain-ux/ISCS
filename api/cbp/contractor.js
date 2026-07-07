/* ============================================================
   Vercel Serverless Function
   GET /api/cbp/contractor?token=XXX

   1. Look up the Client Profile by Portal Token
   2. Validate subscription status (Active or Trial only)
   3. Query Opportunities, apply matching logic (trade + county)
   4. Return contractor info + matched open bids sorted by due date

   Required env vars:
     NOTION_API_KEY
     NOTION_CLIENT_PROFILES_DB_ID  (default baked in below)
     NOTION_OPPORTUNITIES_DB_ID    (default baked in below)

   Falls back to realistic mock data if NOTION_API_KEY is absent —
   ready to go live the moment the key is added.
   ============================================================ */

const CLIENT_PROFILES_DB_ID = process.env.NOTION_CLIENT_PROFILES_DB_ID || '948368a5-466a-4bf8-affb-083b7e8977d5';
const OPPORTUNITIES_DB_ID   = process.env.NOTION_OPPORTUNITIES_DB_ID   || 'dc9a3b8c-3f94-4f9c-a405-947e7f0f900f';
const NOTION_VERSION        = '2022-06-28';
const VALID_STATUSES        = ['Active', 'Trial'];

// ---- Notion helpers ----

async function notionPost(path, body) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization':  `Bearer ${process.env.NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion ${res.status}: ${err}`);
  }
  return res.json();
}

function prop(p) {
  if (!p) return null;
  switch (p.type) {
    case 'title':        return p.title?.map(t => t.plain_text).join('') || '';
    case 'rich_text':    return p.rich_text?.map(t => t.plain_text).join('') || '';
    case 'select':       return p.select?.name || '';
    case 'date':         return p.date?.start || '';
    case 'number':       return p.number ?? null;
    case 'url':          return p.url || '';
    case 'multi_select': return p.multi_select?.map(o => o.name) || [];
    case 'email':        return p.email || '';
    case 'phone_number': return p.phone_number || '';
    default:             return null;
  }
}

async function queryAll(dbId, filter, sorts) {
  const results = [];
  let cursor = null;
  do {
    const body = { page_size: 100 };
    if (filter) body.filter = filter;
    if (sorts)  body.sorts  = sorts;
    if (cursor) body.start_cursor = cursor;
    const data = await notionPost(`/databases/${dbId}/query`, body);
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return results;
}

// ---- Mock data (used when NOTION_API_KEY is absent) ----
// Matches the schema of Client Profiles + Opportunities databases.
// Use token "demo-roofing-2025" to see the mock dashboard.

const MOCK_CONTRACTOR = {
  id:                 'mock-001',
  name:               'Gulf Coast Roofing LLC',
  portalToken:        'demo-roofing-2025',
  trades:             ['Roofing'],
  serviceArea:        ['Escambia', 'Santa Rosa', 'Okaloosa'],
  tier:               'Silver',
  subscriptionStatus: 'Active',
  licenseNumber:      'CCC1333456',
  contactEmail:       'info@gulfcoastroofing.com',
  primaryContact:     'Mike Johnson',
};

const MOCK_OPPORTUNITIES = [
  {
    id:             'opp-001',
    title:          'Escambia County Courthouse Roof Replacement',
    agency:         'Escambia County BOCC',
    county:         'Escambia',
    tradeCategory:  ['Roofing'],
    dueDate:        '2026-07-15',
    estimatedValue: 285000,
    portalLink:     '',
    source:         'DemandStar',
  },
  {
    id:             'opp-002',
    title:          'Santa Rosa County Fire Station #4 Re-Roof',
    agency:         'Santa Rosa County',
    county:         'Santa Rosa',
    tradeCategory:  ['Roofing'],
    dueDate:        '2026-07-28',
    estimatedValue: 145000,
    portalLink:     '',
    source:         'DemandStar',
  },
  {
    id:             'opp-003',
    title:          'Okaloosa County Schools Roof Repairs — FY2026',
    agency:         'Okaloosa County School District',
    county:         'Okaloosa',
    tradeCategory:  ['Roofing'],
    dueDate:        '2026-08-10',
    estimatedValue: 420000,
    portalLink:     '',
    source:         'MFMP',
  },
  {
    id:             'opp-004',
    title:          'Pensacola International Airport Terminal Roof Assessment',
    agency:         'Escambia County Aviation Authority',
    county:         'Escambia',
    tradeCategory:  ['Roofing', 'General Contracting'],
    dueDate:        '2026-09-05',
    estimatedValue: 65000,
    portalLink:     '',
    source:         'DemandStar',
  },
  // This one is out-of-area (Leon county) — should NOT appear for the mock contractor
  {
    id:             'opp-005',
    title:          'Leon County Government Center Roof Repair',
    agency:         'Leon County',
    county:         'Leon',
    tradeCategory:  ['Roofing'],
    dueDate:        '2026-08-20',
    estimatedValue: 95000,
    portalLink:     '',
    source:         'MFMP',
  },
];

// ---- Matching logic ----
//
// v2 (July 2026 pivot): Geography is the ONLY hard gate.
//   - Trade/license category is informational/tag-only — contractors often
//     hold multiple licenses (e.g. GC + Roofing), so hard-filtering on trade
//     caused false negatives and excluded valid matches. Trade is still
//     returned on each opportunity so the UI/emails can tag it, it just no
//     longer gates visibility.
//   - County / Region must be in the contractor's Service Area (Bronze =
//     county-level, Silver/Gold = statewide FL).
//
// TODO (v3 — statewide license support):
//   Once a "License Tier by Trade" field is added to Client Profiles
//   (e.g. { Roofing: 'statewide', 'General Contracting': 'county' }),
//   replace the flat county check with:
//
//     const isStatewide = contractor.licenseTierByTrade?.[trade] === 'statewide';
//     const countyOk = isStatewide || contractor.serviceArea.includes(opp.county);
//
//   This will allow certified (statewide) contractors to see opportunities
//   across ALL counties for their statewide-licensed trade while remaining
//   county-limited for other trades.

function matchesContractor(opp, contractor) {
  // Geography is the sole hard gate.
  return contractor.serviceArea.includes(opp.county);
}

// ---- Handler ----

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'Missing token' });
  }
  const cleanToken = token.trim();

  // ---- Mock mode (no API key configured) ----
  if (!process.env.NOTION_API_KEY) {
    if (cleanToken !== MOCK_CONTRACTOR.portalToken) {
      return res.status(404).json({ error: 'not_found' });
    }
    const bids = MOCK_OPPORTUNITIES.filter(o => matchesContractor(o, MOCK_CONTRACTOR));
    // Sort by due date ascending (mock data already ordered, but be explicit)
    bids.sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1);
    return res.status(200).json({ contractor: MOCK_CONTRACTOR, bids, mock: true });
  }

  // ---- Live Notion mode ----
  try {
    // 1. Look up contractor by Portal Token
    const profilePages = await queryAll(CLIENT_PROFILES_DB_ID, {
      property: 'Portal Token',
      rich_text: { equals: cleanToken },
    }, null);

    if (profilePages.length === 0) {
      return res.status(404).json({ error: 'not_found' });
    }

    const pp = profilePages[0].properties;
    const subscriptionStatus = prop(pp['Subscription Status']);

    // Don't leak token existence for inactive subscriptions — treat as not found
    if (!VALID_STATUSES.includes(subscriptionStatus)) {
      return res.status(404).json({ error: 'not_found' });
    }

    const contractor = {
      id:                 profilePages[0].id,
      name:               prop(pp['Contractor / Company']),
      portalToken:        cleanToken,
      trades:             prop(pp['Trade(s)']) || [],
      serviceArea:        prop(pp['Service Area']) || [],
      tier:               prop(pp['Tier']),
      subscriptionStatus: subscriptionStatus,
      licenseNumber:      prop(pp['License Number']),
      contactEmail:       prop(pp['Contact Email']),
      primaryContact:     prop(pp['Primary Contact']),
    };

    // 2. Query all open, non-expired opportunities
    const today = new Date().toISOString().slice(0, 10);
    const oppFilter = {
      and: [
        { property: 'Status', select: { equals: 'Open' } },
        {
          or: [
            { property: 'Due Date', date: { on_or_after: today } },
            { property: 'Due Date', date: { is_empty: true } },
          ],
        },
      ],
    };
    const oppPages = await queryAll(
      OPPORTUNITIES_DB_ID,
      oppFilter,
      [{ property: 'Due Date', direction: 'ascending' }]
    );

    // 3. Map Notion pages → plain objects, then filter to this contractor
    const allOpps = oppPages.map(page => {
      const p = page.properties;
      return {
        id:             page.id,
        title:          prop(p['Opportunity Title']),
        agency:         prop(p['Agency']),
        county:         prop(p['County / Region']),
        tradeCategory:  prop(p['Trade Category']) || [],
        dueDate:        prop(p['Due Date']),
        estimatedValue: prop(p['Estimated Value']),
        portalLink:     prop(p['Portal Link']),
        source:         prop(p['Source']),
      };
    });

    const bids = allOpps.filter(o => matchesContractor(o, contractor));

    return res.status(200).json({ contractor, bids, mock: false });

  } catch (err) {
    console.error('contractor.js error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
