# DemandStar Gulf Coast Scraper — Deployment Guide

Actor ID (already live): **Tpb9aDIUsEehYwFau**
Apify account: **iscs**
Schedule ID (already set): **1FhWjE7Bahn3P92Fc** — every Sunday 7:45 PM CT

---

## Prerequisites

```bash
npm install -g apify-cli   # one-time — skip if already installed
apify login                # enter your Apify token when prompted
                           # (find it at https://console.apify.com/account/integrations)
```

---

## Push Updated Code to Apify

From the **`demandstar-actor/`** directory:

```bash
cd "Cowork Files/demandstar-actor"
apify push
```

This builds a new Docker image and creates version `0.0` on the existing actor
(`Tpb9aDIUsEehYwFau`). The CLI uses `.actor/actor.json` for metadata and
`Dockerfile` for the build.

> If `apify push` prompts for an actor name/ID, enter `Tpb9aDIUsEehYwFau`
> or the full username-prefixed name `iscs/demandstar-gulf-coast-scraper`.

---

## Manual Upload (if CLI doesn't work)

1. Zip the entire `demandstar-actor/` folder.
2. In Apify Console → **Actors** → open the actor → **Source** tab.
3. Select **"Multiple source files"** or **"Zip file upload"** and upload.
4. Click **Build** to trigger a new image build.

---

## Configure Actor Input (Credentials)

In the Apify Console, open the actor → **Input** tab:

| Field | Value |
|---|---|
| DemandStar Email | `independentsupplychain@gmail.com` |
| DemandStar Password | *(your DemandStar/OpenBids password)* |
| Disable Gulf Coast filter | `false` (returns all FL + AL bids statewide — **recommended default**) |

> Store credentials in **Actor env vars** (Settings → Environment variables)
> as `DEMANDSTAR_EMAIL` and `DEMANDSTAR_PASSWORD` rather than hardcoding
> them in the Input tab, so they survive actor version updates.

---

## Verify the Schedule

The existing schedule (`1FhWjE7Bahn3P92Fc`) should still be active.
To confirm:

1. Apify Console → **Schedules** → find "DemandStar" schedule.
2. Verify: cron `45 19 * * 0`, timezone `America/Chicago`.
3. Confirm it points to actor `Tpb9aDIUsEehYwFau`.

If the schedule needs to be recreated:

```
Cron expression: 45 19 * * 0
Timezone:        America/Chicago
Actor:           Tpb9aDIUsEehYwFau
```

---

## Local Test Run

Requires outbound internet access to `demandstar.com` and `api.demandstar.com`.

```bash
cd demandstar-actor
npm install
DEMANDSTAR_EMAIL="independentsupplychain@gmail.com" \
DEMANDSTAR_PASSWORD="<password>" \
apify run
```

Results appear in `./storage/datasets/default/`. Debug screenshots are saved
to `./storage/key_value_stores/default/` (filenames start with `DEBUG-`).

**If `apify run` isn't available**, test with:

```bash
node src/main.js
```

(The actor reads `DEMANDSTAR_EMAIL`/`DEMANDSTAR_PASSWORD` from env or from
`./storage/key_value_stores/default/INPUT.json`.)

---

## Expected Output Schema

Each record in the Apify dataset will have:

| Field | Type | Notes |
|---|---|---|
| `opportunity_id` | string | DemandStar bid ID |
| `opportunity_title` | string | Bid name |
| `agency_name` | string | Issuing agency |
| `due_date` | string\|null | Submission deadline |
| `estimated_value` | number\|null | Contract value if available |
| `portal_link` | string | Direct URL to bid detail page |
| `trade_category` | string[] | Keyword-derived (see caveats below) |
| `county_region` | string | Gulf Coast region if detectable, else `""` |
| `source` | string | Always `"DemandStar"` |
| `first_seen` | string | ISO date of the run (e.g. `"2026-06-15"`) |

---

## Assumptions / Caveats — David Must Review

### `trade_category` field
- Derived by **keyword-matching the bid title** (e.g. title contains "roof" → `["Roofing"]`).
- This is coarse. Bids with vague titles like "Annual Maintenance Contract" or
  "Facility Services RFP" will return `[]` (empty array).
- **Action:** After the first live run, review 10–20 records and add any missing
  keywords to the `TRADE_CATEGORY_KEYWORDS` array in `src/main.js`.
- Make.com can also apply a secondary category classification step using the
  full bid detail page if needed.

### `county_region` field
- Derived by **keyword-matching the agency name** against known Gulf Coast
  city/county names.
- Statewide agencies (e.g., "Florida Dept of Transportation") will return `""`.
- This field is informational — Make.com should not gate on it.

### `disableGeographyFilter` naming
- `false` (default) = **no filter**, returns ALL active FL + AL bids statewide.
- `true` = Gulf Coast keyword filter ON (restricts to Pensacola → Tallahassee + Mobile corridor).
- The variable name is confusing (legacy); behavior is correct as coded.

### API coverage
- DemandStar's search API caps at 200 results per call.
- The actor runs two passes per state (DESC + ASC by broadcast date) and
  deduplicates, covering ~90%+ of active bids.
- Weekly new bids (~20–40) fit within a single pass.

### DemandStar login changes
- DemandStar rebranded as **OpenBids**. Login page: `/app/login`.
- The login form uses a **"Username"** field — enter the email address there.
- If login breaks after a platform update, check `DEBUG-screenshot-*` entries
  in the Apify key-value store for a visual of what the browser saw.
