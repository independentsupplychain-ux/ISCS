/* ============================================================
   Vercel Serverless Function
   GET /api/cbp/portal-data?token=XXX
   Token-authenticated endpoint for the contractor dashboard.

   Returns:
     { contractor: {...}, opportunities: [...], threads: [...] }

   Required env vars:
     NOTION_API_KEY
   ============================================================ */

const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const CLIENT_PROFILES_DB = '948368a5-466a-4bf8-affb-083b7e8977d5';
const OPPORTUNITIES_DB   = 'dc9a3b8c-3f94-4f9c-a405-947e7f0f900f';
const BID_RECORDS_DB     = '0566f8a4-07bf-4e7e-9d8e-378d49bcbd89';

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
    default:             return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    // 1. Look up contractor by portal token
    const profileResults = await notion.databases.query({
      database_id: CLIENT_PROFILES_DB,
      filter: { property: 'Portal Token', rich_text: { equals: token } },
    });

    if (!profileResults.results[0]) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const profile = profileResults.results[0];
    const pp = profile.properties;
    const tier = prop(pp['Tier']);
    const contractorName = prop(pp['Contractor / Company']);

    // 2. Fetch open opportunities sorted by due date
    const opps = await notion.databases.query({
      database_id: OPPORTUNITIES_DB,
      filter: { property: 'Status', select: { equals: 'Open' } },
      sorts: [{ property: 'Due Date', direction: 'ascending' }],
    });

    // 3. Fetch bid threads (Gold tier only)
    let threads = [];
    if (tier === 'Gold' && contractorName) {
      const bids = await notion.databases.query({
        database_id: BID_RECORDS_DB,
        filter: { property: 'Contractor Name', rich_text: { contains: contractorName } },
        sorts: [{ property: 'Submission Date', direction: 'descending' }],
      });
      threads = bids.results.map(page => {
        const p = page.properties;
        return {
          id:              page.id,
          opportunity:     prop(p['Opportunity Name']),
          agency:          prop(p['Agency']),
          bidAmount:       prop(p['Bid Amount']),
          submissionDate:  prop(p['Submission Date']),
          status:          prop(p['Status']),
        };
      });
    }

    return res.status(200).json({
      contractor: {
        name:             contractorName,
        email:            prop(pp['Contact Email']),
        tier,
        stripeCustomerId: prop(pp['Stripe Customer ID']),
      },
      opportunities: opps.results.map(page => {
        const p = page.properties;
        return {
          id:             page.id,
          title:          prop(p['Opportunity Title']) || prop(p['Name']),
          agency:         prop(p['Agency']),
          dueDate:        prop(p['Due Date']),
          estimatedValue: prop(p['Estimated Value']),
          portalLink:     prop(p['Portal Link']),
          tradeCategory:  prop(p['Trade Category']) || [],
        };
      }),
      threads,
    });

  } catch (err) {
    console.error('portal-data error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
