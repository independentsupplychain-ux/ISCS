/* ============================================================
   Vercel Serverless Function
   GET /api/cbp/bids
   Returns open, non-expired opportunities from CBP Opportunities
   Notion database, sorted by due date (soonest first).

   Required env vars:
     NOTION_API_KEY
   ============================================================ */

const NOTION_DB_ID   = 'f7982cdf-54c9-4a71-aaff-d60df39875cd';
const NOTION_VERSION = '2022-06-28';

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

function txt(prop) {
  if (!prop) return '';
  if (prop.type === 'title')      return prop.title?.map(t => t.plain_text).join('') || '';
  if (prop.type === 'rich_text')  return prop.rich_text?.map(t => t.plain_text).join('') || '';
  if (prop.type === 'select')     return prop.select?.name || '';
  if (prop.type === 'date')       return prop.date?.start || '';
  if (prop.type === 'number')     return prop.number ?? null;
  if (prop.type === 'url')        return prop.url || '';
  if (prop.type === 'multi_select') return prop.multi_select?.map(o => o.name) || [];
  return '';
}

// Fetch all pages from Notion (cursor-paginated)
async function queryAll(filter, sorts) {
  const results = [];
  let cursor = null;

  do {
    const body = { page_size: 100, filter, sorts };
    if (cursor) body.start_cursor = cursor;

    const data = await notionPost(`/databases/${NOTION_DB_ID}/query`, body);
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return results;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.NOTION_API_KEY) return res.status(500).json({ error: 'Notion API key not configured.' });

  const today = new Date().toISOString().slice(0, 10);  // "YYYY-MM-DD"

  // Filter: Status = Open AND (Due Date >= today OR Due Date is empty)
  const filter = {
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

  // Sort soonest due date first; records with no due date fall to the end
  const sorts = [{ property: 'Due Date', direction: 'ascending' }];

  try {
    const pages = await queryAll(filter, sorts);

    const bids = pages.map(page => {
      const p = page.properties;
      return {
        id:             page.id,
        opportunity:    txt(p['Opportunity Title']),
        agency:         txt(p['Agency']),
        dueDate:        txt(p['Due Date']),
        estimatedValue: txt(p['Estimated Value']),
        tradeCategory:  txt(p['Trade Category']),   // array
        status:         txt(p['Status']),
        source:         txt(p['Source']),
        portalLink:     txt(p['Portal Link']),
        firstSeen:      txt(p['First Seen']),
      };
    });

    return res.status(200).json({ bids, count: bids.length, asOf: today });

  } catch (err) {
    console.error('bids.js error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
