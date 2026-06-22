# CBP Contractor Portal — Brief 1 Build Notes

## What was built

Token-based, read-only contractor dashboard. A contractor visits their unique link and sees their matched open bid opportunities — no login required.

**Files added/changed:**
| File | What it does |
|---|---|
| `api/cbp/contractor.js` | New Vercel serverless function — looks up contractor by token, queries Notion, applies matching logic |
| `contractorbidprep/portal/bid-portal.html` | New HTML portal page — reads token from URL, renders dashboard |
| `vercel.json` | Added `/portal/:token` rewrite so clean URLs work |

The existing `login.html`, `dashboard.html`, and `/api/cbp/bids` are untouched.

---

## Env vars required

| Var | Description |
|---|---|
| `NOTION_API_KEY` | Notion integration token (internal integration, must have access to both DBs) |
| `NOTION_CLIENT_PROFILES_DB_ID` | Optional — defaults to `4ad603ac-a8c0-4282-ae1b-4d898abd15e7` |
| `NOTION_OPPORTUNITIES_DB_ID` | Optional — defaults to `f7982cdf-54c9-4a71-aaff-d60df39875cd` |

Set these in the Vercel project dashboard under Settings → Environment Variables.

**If `NOTION_API_KEY` is absent**, the API falls back to mock data automatically. No crashes, no errors — the dashboard works end-to-end with sample fixtures so you can test the full UI before wiring up Notion.

---

## Local testing

### Without Notion (mock mode)

1. Start Vercel dev: `npx vercel dev` from the project root (`Cowork Files/`)
2. Visit: `http://localhost:3000/portal/bid-portal.html?token=demo-roofing-2025`
   - The `?token=` fallback is used because the rewrite only applies in Vercel's edge routing, not local file serving
3. You should see "Gulf Coast Roofing LLC" (Silver tier) with 4 matched bids in Escambia, Santa Rosa, and Okaloosa counties

### With Notion (live mode)

1. Set `NOTION_API_KEY` in your local `.env` or as a shell var: `export NOTION_API_KEY=secret_...`
2. Run `npx vercel dev`
3. Visit: `http://localhost:3000/portal/ACTUAL-TOKEN-FROM-NOTION`
   - The "Portal Token" field in the Client Profiles DB is the value that goes in the URL

### Testing the rewrite (clean URLs)

The rewrite `/portal/:token → /portal/bid-portal.html` only fires in Vercel's routing layer (both local `vercel dev` and production). Direct file access (opening the HTML file in a browser) won't trigger it — use the `?token=` param in that case.

---

## How contractor URLs are generated

Each contractor's URL is:
```
https://contractorbidprep.com/portal/PORTAL-TOKEN-VALUE
```

The `Portal Token` field in the Notion **Client Profiles** database holds the token. Set it to anything unique and hard-to-guess (e.g. a UUID or a memorable slug like `gulf-coast-roofing-a7f2`). Share the full URL with the contractor via their welcome email.

---

## Access control

- Token in URL is the only gate. If the token doesn't match any profile → generic "link not found" page (no data leaked).
- If subscription status is not `Active` or `Trial` → same generic "link not found" (no data leaked, no hint the account exists).
- No session, no cookies, no login flow needed.

---

## Matching logic (v1)

A bid appears on a contractor's dashboard if:
1. `Status = Open` (and due date is today or future, or empty)
2. `Trade Category` intersects the contractor's `Trade(s)`
3. `County / Region` is in the contractor's `Service Area`

**Known limitation / TODO (v2):** v1 treats every contractor as county-limited. When you add a "License Tier by Trade" field to Client Profiles (Certified = statewide, Registered = county-only), update the `matchesContractor()` function in `api/cbp/contractor.js` — there's a clearly marked `TODO (v2)` comment with the one-line change needed.

---

## Slotting into the existing Vercel project

This build is additive — drop the two new files into the same repo and deploy. No new dependencies (the API uses native `fetch`, same as the existing `bids.js`). `vercel.json` now has a `rewrites` key alongside the existing `functions` key.

If this is the first time deploying the whole project, make sure `NOTION_API_KEY` and `STRIPE_SECRET_KEY` are set in Vercel before pushing. The portal works in mock mode without the Notion key, but live matching requires it.
