# Tier 1 Two-Way SMS Flow Spec
**Project:** Contractors BidBuddy / PublicBidPrep Co. (DBAs under ISCS)
**Step:** 9 — Tier 1 Automation Build
**Date:** June 8, 2026
**Stack:** Make.com · Twilio · Docupilot · PandaDoc · Notion
**Scope:** Pilot (one contractor). Architected for multi-client expansion.

---

## Flow Overview

Each Sunday at 7:45 PM CT, an Apify scraper delivers a fresh list of government bid opportunities. Make.com picks up these results and fires an outbound SMS to the enrolled contractor for each opportunity — formatted with the job name, agency, due date, estimated value, a shortened portal link, and a plain-English prompt to reply with their bid number. When the contractor replies, Twilio forwards the message to a Make.com webhook. Make.com checks the reply: if it's a clean dollar amount, it triggers Docupilot to assemble the bid document, then hands it to PandaDoc for e-signature. Once the contractor signs, Make.com logs the completed record to the Notion Bid Records database. If the reply is non-numeric or ambiguous, the thread is flagged in Notion as "Review Needed" and David receives an email with the raw reply for manual handling. Two additional edge cases are managed automatically: opportunities that go unanswered for 48 hours are flagged "No Response" in Notion with no further action, and opportunities that appear in consecutive weekly scrapes are deduplicated so the contractor never receives the same SMS twice.

---

## Module-by-Module Build Sequence

> Build as **two separate Make.com scenarios**: Scenario A (Outbound SMS) and Scenario B (Inbound Reply Handler). They communicate via a shared Make.com Data Store.

---

### SCENARIO A — Outbound SMS Sender

**Trigger:** Scheduled — every Sunday at 7:45 PM CT (or immediately after Apify run completes via webhook from Apify).

---

**Module A-1: HTTP — Make a Request (Apify Results Fetch)**

| Setting | Value |
|---|---|
| URL | `https://api.apify.com/v2/actor-runs/last/dataset/items?token={{APIFY_TOKEN}}` |
| Method | GET |
| Query String | `actorId` = your DemandStar actor ID |
| Parse Response | Yes |
| Expected output | Array of opportunity objects |

_Alternative:_ If using Apify's Make.com integration module (if available in the Make.com app library), use **Apify → Get Dataset Items** and configure with the Actor ID and API token. Either approach yields the same array output.

---

**Module A-2: Tools — Set Variable (Contractor Profile)**

Hardcode the pilot contractor's profile as variables until a multi-client Notion lookup is built.

| Variable | Value |
|---|---|
| `contractor_name` | `[Contractor First Last]` |
| `contractor_phone` | `+1[10-digit mobile]` |
| `contractor_email` | `[contractor@email.com]` |

_Note:_ In the multi-client iteration, replace this module with a Notion → Search Records lookup to pull contractor profiles by trade code.

---

**Module A-3: Iterator**

- **Source:** Output array from Module A-1
- Iterates over each opportunity object one at a time, feeding Modules A-4 through A-7.

---

**Module A-4: Data Store — Search Records (Dedup Check)**

Before sending each SMS, check whether this opportunity was already sent in a prior week.

| Setting | Value |
|---|---|
| Data Store | `BidBuddy_SentOpportunities` |
| Filter | `opportunity_id` = `{{A3.opportunity_id}}` |

- **If record found:** Route to Module A-5 (skip — duplicate)
- **If no record found:** Route to Module A-6 (proceed — new opportunity)

_Data Store schema — `BidBuddy_SentOpportunities`:_

| Field | Type |
|---|---|
| `opportunity_id` | Text (primary key) |
| `contractor_phone` | Text |
| `sent_at` | Date/Time |

---

**Module A-5: Tools — Set Variable (Skip Flag)**

- Set `skip = true`
- Connect to end of iterator (no further modules execute for this record)

---

**Module A-6: Twilio — Send an SMS**

| Setting | Value |
|---|---|
| From | Your Twilio number (e.g., `+18501234567`) |
| To | `{{A2.contractor_phone}}` |
| Body | See message template below |

**Message Template:**

```
New bid: {{A3.opportunity_title}} – {{A3.agency_name}}
Due: {{formatDate(A3.due_date; "MM/DD/YY")}} | Est: ${{A3.estimated_value}}
{{A3.short_link}}
Reply with your bid $ amount.
```

**Character count guidance:**
- Target: ≤ 160 characters (single SMS segment)
- Opportunity title and agency name are the variable-length fields. If combined they exceed ~60 characters, truncate opportunity title to 40 characters using `{{substring(A3.opportunity_title; 0; 40)}}`.
- Portal links from DemandStar are typically long. **Required:** Pre-shorten all portal URLs in the Apify scraper output (using a Bitly or Rebrandly Make.com module inserted before the Iterator), or use Twilio's built-in link shortening in the Twilio console. A shortened URL occupies ~23 characters.
- If 160 characters cannot be reliably met after shortening, switch the Twilio module to MMS (set `Media URL` field) and remove the character constraint.

---

**Module A-7: Data Store — Add/Replace a Record (Log Sent Opportunity)**

After SMS sends successfully, write to `BidBuddy_SentOpportunities` to prevent future duplicates.

| Field | Value |
|---|---|
| `opportunity_id` | `{{A3.opportunity_id}}` |
| `contractor_phone` | `{{A2.contractor_phone}}` |
| `sent_at` | `{{now}}` |

---

**Module A-8: Data Store — Add/Replace a Record (Open Thread Log)**

Write to a second data store (`BidBuddy_ActiveThreads`) to enable the 48-hour timeout check and to map inbound replies back to their opportunity.

| Field | Value |
|---|---|
| `thread_id` | `{{A3.opportunity_id}}_{{A2.contractor_phone}}` (composite key) |
| `opportunity_id` | `{{A3.opportunity_id}}` |
| `opportunity_title` | `{{A3.opportunity_title}}` |
| `agency_name` | `{{A3.agency_name}}` |
| `due_date` | `{{A3.due_date}}` |
| `estimated_value` | `{{A3.estimated_value}}` |
| `contractor_name` | `{{A2.contractor_name}}` |
| `contractor_phone` | `{{A2.contractor_phone}}` |
| `contractor_email` | `{{A2.contractor_email}}` |
| `sent_at` | `{{now}}` |
| `status` | `pending` |

_Data Store schema — `BidBuddy_ActiveThreads`:_

| Field | Type |
|---|---|
| `thread_id` | Text (primary key) |
| `opportunity_id` | Text |
| `opportunity_title` | Text |
| `agency_name` | Text |
| `due_date` | Date/Time |
| `estimated_value` | Text |
| `contractor_name` | Text |
| `contractor_phone` | Text |
| `contractor_email` | Text |
| `sent_at` | Date/Time |
| `status` | Text (`pending` / `replied` / `no_response`) |

---

### SCENARIO B — Inbound Reply Handler

**Trigger:** Webhooks — Custom Webhook (receives Twilio POST on contractor reply)

---

**Twilio Webhook Configuration:**

In your Twilio console, navigate to your SMS-capable phone number → Messaging → "A message comes in":
- **Webhook URL:** `https://hook.us1.make.com/[your-webhook-id]` (generated by Make.com Webhooks module)
- **HTTP Method:** POST
- **Fallback URL:** leave blank for now

Twilio will POST the following fields to Make.com on each inbound SMS:

| Twilio Field | Description |
|---|---|
| `Body` | The contractor's raw reply text |
| `From` | Contractor's phone number (E.164 format, e.g. `+18505551234`) |
| `To` | Your Twilio number |
| `MessageSid` | Unique message ID |
| `NumMedia` | Number of media attachments (0 for plain SMS) |

---

**Module B-1: Webhooks — Custom Webhook (Trigger)**

- Click **Add** to create a new webhook and copy the generated URL into Twilio (above).
- Make.com will auto-detect the data structure after the first test message is received.
- Key fields available downstream: `{{1.Body}}`, `{{1.From}}`, `{{1.To}}`, `{{1.MessageSid}}`

---

**Module B-2: Data Store — Search Records (Thread Lookup)**

Match the inbound reply to its open opportunity using the contractor's phone number.

| Setting | Value |
|---|---|
| Data Store | `BidBuddy_ActiveThreads` |
| Filter | `contractor_phone` = `{{1.From}}` AND `status` = `pending` |
| Sort | `sent_at` descending |
| Limit | 1 (most recent open thread for this contractor) |

Output available as `{{2.opportunity_title}}`, `{{2.agency_name}}`, etc.

_Note:_ In the pilot, the contractor has one active thread at a time. Multi-opportunity weeks will generate multiple threads, but the Iterator in Scenario A sends each SMS separately and each creates its own record. The lookup above using `status = pending` sorted by most recent `sent_at` is the correct approach for the pilot. For multi-client expansion, add `contractor_phone` as a partition key and always match on `opportunity_id` embedded in a session token.

---

**Module B-3: Router**

Two routes: **Route 1 — Numeric Amount** and **Route 2 — Non-Numeric / Manual Review**.

Filter expressions are defined in the next section. Both routes continue from here.

---

#### ROUTE 1 — Numeric Amount → Docupilot → PandaDoc → Notion

**Module B-4: Tools — Set Variable (Parse Bid Amount)**

Strip formatting characters from the raw reply to get a clean number.

| Variable | Expression |
|---|---|
| `raw_reply` | `{{1.Body}}` |
| `bid_amount_clean` | `{{parseNumber(replaceAll(replaceAll(replaceAll(trim(1.Body); "$"; ""); ","; ""); " "; ""))}}` |

---

**Module B-5: Docupilot — Create Document**

| Setting | Value |
|---|---|
| Template ID | `[Your Docupilot template ID — see Open Questions]` |
| Output Format | PDF |

**Data fields passed to Docupilot template:**

| Template Variable | Make.com Source | Notes |
|---|---|---|
| `{{contractor_name}}` | `{{2.contractor_name}}` | From thread lookup |
| `{{contractor_email}}` | `{{2.contractor_email}}` | From thread lookup |
| `{{opportunity_title}}` | `{{2.opportunity_title}}` | From thread lookup |
| `{{agency_name}}` | `{{2.agency_name}}` | From thread lookup |
| `{{due_date}}` | `{{formatDate(2.due_date; "MMMM D, YYYY")}}` | Human-readable format |
| `{{estimated_value}}` | `{{2.estimated_value}}` | From thread lookup |
| `{{bid_amount}}` | `{{B4.bid_amount_clean}}` | Parsed from reply |
| `{{submission_date}}` | `{{formatDate(now; "MMMM D, YYYY")}}` | Today's date |

**Expected Docupilot output:** A generated PDF returned as a file URL (`document_url`).

**Minimum bid document contents (inform your Docupilot template design):**
- Cover page: Contractor name, contractor contact info, submission date
- Opportunity reference: Agency name, opportunity title, due date
- Bid amount (displayed prominently as currency)
- Signature block (for PandaDoc to overlay)
- Optional: boilerplate scope acknowledgment paragraph

---

**Module B-6: PandaDoc — Create Document from Template** *(or Upload + Send)*

If using a PandaDoc template with merge fields:

| Setting | Value |
|---|---|
| Module | PandaDoc → Create Document from Template |
| Template ID | `[Your PandaDoc template ID]` |
| Document Name | `Bid – {{2.opportunity_title}} – {{2.contractor_name}}` |

If using Docupilot's generated PDF directly (uploading to PandaDoc):

| Setting | Value |
|---|---|
| Module | PandaDoc → Upload Document (from URL) |
| File URL | `{{5.document_url}}` (Docupilot output) |
| Document Name | `Bid – {{2.opportunity_title}} – {{2.contractor_name}}` |

---

**Module B-7: PandaDoc — Send Document**

| Setting | Value |
|---|---|
| Document ID | `{{6.id}}` (from Module B-6) |
| Recipients | See below |
| Subject | `Bid Document Ready — Please Sign` |
| Message | `Hi {{2.contractor_name}}, your bid document for {{2.opportunity_title}} is ready. Please review and sign.` |

**Recipient configuration:**

| Recipient | Role | Field |
|---|---|---|
| Contractor | Signer | Email: `{{2.contractor_email}}` |
| David (sender) | CC / Owner | Email: `davidkduncan@gmail.com` |

---

**Module B-8: PandaDoc — Watch Documents (Webhook trigger for completion)**

_Option A (recommended):_ Configure a PandaDoc webhook in your PandaDoc account settings to fire on `document.completed` events. Point it to a second Make.com webhook. Build a **Scenario C** (PandaDoc Completion → Notion Logging) triggered by that webhook.

_Option B (simpler for pilot):_ In Scenario B, after Module B-7, add a **Sleep** module (delay 24 hours) and then a **PandaDoc → Get Document** module to poll status. When status = `document.completed`, continue to Notion logging. This is less elegant but avoids building a third scenario.

**Recommended for pilot:** Use Option A (separate Scenario C) for clean architecture. Instructions below assume Scenario C exists.

---

### SCENARIO C — PandaDoc Completion → Notion Log

**Trigger:** Webhooks — Custom Webhook (PandaDoc `document.completed` event)

---

**Module C-1: Webhooks — Custom Webhook (PandaDoc Completion)**

PandaDoc POST payload includes: `document.id`, `document.name`, `document.status`, `recipients[]`, `created_at`, `completed_at`.

---

**Module C-2: PandaDoc — Get Document**

Fetch full document details using `{{C1.data.id}}` to retrieve all field values including merged data.

---

**Module C-3: Notion — Create a Record (Bid Records Log)**

| Setting | Value |
|---|---|
| Module | Notion → Create a Database Item |
| Database ID | `356e9419-6897-81df-8754-e4729d6ceaae` |

**Fields to populate:**

| Notion Field | Type | Make.com Source |
|---|---|---|
| Opportunity Name | Title | `{{C2.name}}` (parse from doc name) or pass via PandaDoc custom field |
| Agency | Text | Passed via PandaDoc custom field (set in B-6) |
| Contractor Name | Text | `{{C2.recipients[1].email}}` or custom field |
| Bid Amount | Number | Custom field set in B-6 |
| Submission Date | Date | `{{C1.data.date_completed}}` |
| Status | Select | `Submitted` |

_Important:_ To reliably pass `opportunity_title`, `agency_name`, `contractor_name`, and `bid_amount` through to Scenario C, set them as **custom fields** on the PandaDoc document in Module B-6. PandaDoc's API supports `metadata` on document creation. Store key values there so Scenario C can read them back from the `document.completed` webhook payload without needing another data store lookup.

---

**Module C-4: Data Store — Update a Record (Close Thread)**

Mark the thread as resolved so it doesn't trigger a timeout flag.

| Setting | Value |
|---|---|
| Data Store | `BidBuddy_ActiveThreads` |
| Key | Lookup by `contractor_phone` + `status = pending` |
| Update | `status` → `replied` |

---

#### ROUTE 2 — Non-Numeric Reply → Manual Review

**Module B-9: Notion — Create a Database Item (Review Needed)**

| Setting | Value |
|---|---|
| Module | Notion → Create a Database Item |
| Database ID | `356e9419-6897-81df-8754-e4729d6ceaae` |

| Field | Value |
|---|---|
| Opportunity Name | `{{2.opportunity_title}}` |
| Agency | `{{2.agency_name}}` |
| Contractor Name | `{{2.contractor_name}}` |
| Bid Amount | *(leave blank)* |
| Submission Date | `{{formatDate(now; "YYYY-MM-DD")}}` |
| Status | `Review Needed` |
| Notes | `Raw reply: {{1.Body}}` |

---

**Module B-10: Email — Send an Email (Alert to David)**

| Setting | Value |
|---|---|
| To | `davidkduncan@gmail.com` |
| Subject | `BidBuddy: Manual Review Needed — {{2.contractor_name}}` |
| Body (plain text) | See below |

```
Manual review needed for the following bid reply:

Contractor: {{2.contractor_name}}
Opportunity: {{2.opportunity_title}}
Agency: {{2.agency_name}}
Due Date: {{formatDate(2.due_date; "MM/DD/YYYY")}}

Contractor's raw reply:
"{{1.Body}}"

This reply could not be parsed as a dollar amount. Please review and
update the Notion bid record manually.

— BidBuddy Automation
```

---

### SCENARIO D — 48-Hour Timeout Check

**Trigger:** Scheduled — runs every 6 hours (or once daily at 9:00 AM CT, your preference)

---

**Module D-1: Data Store — Search Records (Find Stale Threads)**

| Setting | Value |
|---|---|
| Data Store | `BidBuddy_ActiveThreads` |
| Filter | `status` = `pending` AND `sent_at` ≤ `{{addHours(now; -48)}}` |

---

**Module D-2: Iterator**

Loops over each stale thread returned by D-1.

---

**Module D-3: Notion — Create a Database Item (No Response)**

| Field | Value |
|---|---|
| Opportunity Name | `{{D2.opportunity_title}}` |
| Agency | `{{D2.agency_name}}` |
| Contractor Name | `{{D2.contractor_name}}` |
| Bid Amount | *(leave blank)* |
| Submission Date | `{{formatDate(now; "YYYY-MM-DD")}}` |
| Status | `No Response` |

---

**Module D-4: Data Store — Update a Record (Close Stale Thread)**

| Field | Value |
|---|---|
| Key | `{{D2.thread_id}}` |
| `status` | `no_response` |

_No further action is taken. The brief specifies "flag as No Response in Notion, no further action."_

---

## Make.com Filter Expressions

### Route 1 — Is Numeric (Bid Amount)

Place this filter on the connection between Module B-3 (Router) and Module B-4.

**Filter Label:** `Reply is a valid dollar amount`

| Filter Component | Value |
|---|---|
| Field | `{{1.Body}}` |
| Operator | Matches pattern |
| Pattern | `^\s*\$?\s*[\d,]+(\.\d{1,2})?\s*$` |

**What this matches:**
- `250000` ✓
- `$250,000` ✓
- `250000.00` ✓
- `$250,000.50` ✓
- `250 000` ✗ (space-separated — routes to manual review)
- `250k` ✗
- `two fifty` ✗
- `maybe 200000 not sure` ✗

**Alternative expression using `parseNumber`** (if regex operator is unavailable in your Make.com plan):

| Field | Value |
|---|---|
| `{{parseNumber(replaceAll(replaceAll(trim(1.Body); "$"; ""); ","; ""))}}` | Greater than | `0` |

Use whichever filter operator your Make.com plan supports. The regex approach is more precise.

---

### Route 2 — Is Non-Numeric (Manual Review)

**Filter Label:** `Reply requires manual review`

| Filter Component | Value |
|---|---|
| Field | `{{1.Body}}` |
| Operator | Does not match pattern |
| Pattern | `^\s*\$?\s*[\d,]+(\.\d{1,2})?\s*$` |

Or, if using `parseNumber` approach: check that `parseNumber(...)` is **not** greater than `0` (i.e., equals `0` or returns an error).

---

## Data Field Reference Table

| Variable | Source | Carried By | Used In |
|---|---|---|---|
| `opportunity_id` | Apify JSON | Data Store: SentOpportunities, ActiveThreads | Dedup check, thread matching |
| `opportunity_title` | Apify JSON | Data Store: ActiveThreads → PandaDoc metadata | SMS, Docupilot, PandaDoc, Notion |
| `agency_name` | Apify JSON | Data Store: ActiveThreads → PandaDoc metadata | SMS, Docupilot, PandaDoc, Notion |
| `due_date` | Apify JSON | Data Store: ActiveThreads | SMS, Docupilot |
| `estimated_value` | Apify JSON | Data Store: ActiveThreads | SMS, Docupilot |
| `portal_link` | Apify JSON | Scenario A only | SMS (shortened) |
| `short_link` | URL shortener module | Scenario A only | SMS |
| `contractor_name` | Set Variable (A-2) | Data Store: ActiveThreads → PandaDoc metadata | SMS, Docupilot, PandaDoc, Notion |
| `contractor_phone` | Set Variable (A-2) | Data Store: ActiveThreads | SMS send, reply thread matching |
| `contractor_email` | Set Variable (A-2) | Data Store: ActiveThreads → PandaDoc metadata | Docupilot, PandaDoc |
| `raw_reply` | Twilio webhook (`Body`) | Scenario B local | Filter, manual review email |
| `bid_amount_clean` | Parsed from `raw_reply` | PandaDoc metadata | Docupilot, PandaDoc, Notion |
| `sent_at` | `{{now}}` at SMS send | Data Store: ActiveThreads | Timeout check |
| `submission_date` | `{{now}}` at completion | Scenario C / Notion | Notion log |
| `status` | Set by Make.com logic | Notion, Data Store | Notion log, thread state |
| `thread_id` | Composite: `opportunity_id_contractor_phone` | Data Store: ActiveThreads | Thread management |

---

## Edge Case Handling

### Edge Case 1 — Non-Numeric Reply

**Detection:** Make.com Router filter (Route 2 — does not match numeric pattern)

**Handling:**
1. Module B-9: Create Notion record with `status = "Review Needed"` and `Notes = raw reply text`
2. Module B-10: Send email to David with contractor name, opportunity details, and verbatim reply text
3. Thread remains `status = pending` in `BidBuddy_ActiveThreads` — David must manually update it

**Make.com filter expression:** See "Route 2 — Is Non-Numeric" above.

**No further automation runs** until David manually resolves. This prevents a bad parse from triggering Docupilot with garbage data.

---

### Edge Case 2 — No Reply / Timeout (48 Hours)

**Detection:** Scenario D runs on schedule. Finds all records in `BidBuddy_ActiveThreads` where `status = pending` and `sent_at ≤ now minus 48 hours`.

**Handling:**
1. Module D-3: Create Notion record with `status = "No Response"`
2. Module D-4: Update thread record to `status = no_response`
3. No SMS reminder is sent. No further action.

**Note:** If you later decide to add a 24-hour SMS nudge ("Hey, still interested in bidding on this one?"), insert a second scheduled check at the 24-hour mark that sends a reminder only if status is still `pending`. Build this as an optional enhancement — it is not in scope for Tier 1.

---

### Edge Case 3 — Duplicate Opportunity (Same Job Appears in Two Weekly Scrapes)

**Detection:** Module A-4 checks `BidBuddy_SentOpportunities` data store for `opportunity_id` before sending each SMS.

**Handling:**
- If `opportunity_id` already exists in the store → Module A-5 sets skip flag → Iterator moves to next record. SMS is not sent.
- If `opportunity_id` is not in the store → proceed to send SMS → Module A-7 writes the ID to the store.

**Data retention:** The `BidBuddy_SentOpportunities` data store should be pruned periodically (e.g., every 90 days) to avoid unbounded growth. Add a scheduled cleanup scenario or a Make.com Data Store expiration if supported.

**Prerequisite:** Apify scraper output must include a stable, unique identifier per opportunity (a DemandStar solicitation number or opportunity ID). Confirm this field exists in the scraper JSON and document its key name before building Module A-4.

---

### Edge Case 4 — Multiple Opportunities in One Week

**Handling:** Each opportunity = a separate record in the Apify results array. The Iterator in Scenario A processes them sequentially, sending one SMS per opportunity. Each SMS generates its own record in `BidBuddy_ActiveThreads` with a unique `thread_id`.

When the contractor replies, Module B-2 fetches the most recent `pending` thread for that phone number (sorted by `sent_at` descending). This means replies are matched to the most recent opportunity first.

**Known limitation for pilot:** If the contractor has two open threads and replies to the older one first, the reply will be matched to the newer one. This is acceptable for the pilot (one contractor, low volume). For production, embed a short job reference code in each SMS (e.g., "Reply 'A1: 250000' for job A1") and match on that code rather than recency.

---

## Open Questions for David

These items require a decision or action before the Make.com build can start:

1. **Docupilot template** — The bid document template must be designed and uploaded to Docupilot before Module B-5 can be configured. What fields should appear on the cover page beyond what's listed in this spec? Is there a boilerplate scope or disclaimer paragraph? Does the contractor's license number need to appear?

2. **PandaDoc account and template** — Is your PandaDoc account active? Do you want to upload the Docupilot-generated PDF to PandaDoc (upload approach) or maintain a separate PandaDoc template with merge fields? The upload approach is simpler for Tier 1.

3. **Contractor email address** — The pilot contractor's email is needed for Docupilot and PandaDoc. Confirm the email and add it to Module A-2's Set Variable values before building.

4. **Twilio phone number** — Is your Twilio SMS number purchased and active? Confirm the From number. Ensure it is SMS-capable and not flagged for A2P 10DLC compliance issues (required for business SMS in the US — register your brand if not done).

5. **Apify output field names** — The spec references `opportunity_id`, `opportunity_title`, `agency_name`, `due_date`, `estimated_value`, and `portal_link`. Confirm these match the exact key names in the DemandStar scraper's JSON output. If the field names differ, update all module mappings accordingly.

6. **Notion Bid Records database schema** — Does the Notion database at ID `356e9419-6897-81df-8754-e4729d6ceaae` already have the fields listed in Module C-3 (Opportunity Name, Agency, Contractor Name, Bid Amount, Submission Date, Status)? If not, create these properties in Notion before building Scenario C.

7. **URL shortener for SMS** — Which URL shortening service will you use for portal links? Options: Bitly (has a Make.com module), Rebrandly (has a Make.com module), or Twilio's built-in link shortening. Bitly is the simplest integration — requires a Bitly account and API token.

8. **Manual review email address** — Module B-10 currently sends the manual review alert to `davidkduncan@gmail.com`. Confirm this is correct, or provide an alternate address.

9. **Timeout check frequency** — Scenario D is set to run every 6 hours. Would you prefer once daily (e.g., 9:00 AM CT)? The only functional difference is how quickly the Notion record updates after the 48-hour window closes.

10. **PandaDoc webhook setup** — Scenario C requires a `document.completed` webhook to be registered in PandaDoc account settings. This must be done manually in the PandaDoc dashboard before Scenario C can be tested. Flag this as a setup step during build.

---

*Document version 1.0 — June 8, 2026. Ready for Make.com build.*
