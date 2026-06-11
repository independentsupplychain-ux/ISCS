/* ============================================================
   Vercel Serverless Function
   GET /api/cbp/bids?contractor=<id_or_name>
   Returns bid records from Notion for a given contractor.

   Required env vars:
     NOTION_API_KEY
     NOTION_BID_DB_ID   (default: 356e9419-6897-81df-8754-e4729d6ceaae)
   ============================================================ */

const NOTION_DB_ID = process.env.NOTION_BID_DB_ID || '356e9419-6897-81df-8754-e4729d6ceaae';
const NOTION_VERSION = '2022-06-28';

async function notionRequest(path, body) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error ${res.status}: ${err}`);
  }

  return res.json();
}

function extractText(prop) {
  if (!prop) return '';
  if (prop.type === 'title')   return prop.title?.map(t => t.plain_text).join('') || '';
  if (prop.type === 'rich_text') return prop.rich_text?.map(t => t.plain_text).join('') || '';
  if (prop.type === 'select')  return prop.select?.name || '';
  if (prop.type === 'date')    return prop.date?.start || '';
  if (prop.type === 'number')  return prop.number ?? null;
  if (prop.type === 'url')     return prop.url || '';
  return '';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.NOTION_API_KEY) {
    return res.status(500).json({ error: 'Notion API key not configured.' });
  }

  const contractor = req.query?.contractor || '';

  // Build Notion filter — if a contractor name is provided, filter by it
  const filter = contractor
    ? {
        property: 'Contractor',
        rich_text: { contains: contractor },
      }
    : undefined;

  try {
    const data = await notionRequest(`/databases/${NOTION_DB_ID}/query`, {
      ...(filter ? { filter } : {}),
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: 50,
    });

    const bids = data.results.map(page => {
      const p = page.properties;
      return {
        id: page.id,
        opportunity: extractText(p['Opportunity Name'] || p['Name'] || p['Opportunity']),
        agency:      extractText(p['Agency'] || p['Issuing Agency']),
        status:      extractText(p['Status']),
        dueDate:     extractText(p['Due Date'] || p['Bid Due Date']),
        bidAmount:   extractText(p['Bid Amount'] || p['Amount']),
        source:      extractText(p['Source'] || p['Portal']),
        contractor:  extractText(p['Contractor']),
        lastEdited:  page.last_edited_time,
      };
    });

    return res.status(200).json({ bids });
  } catch (err) {
    console.error('Notion error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
