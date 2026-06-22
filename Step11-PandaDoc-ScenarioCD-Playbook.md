# Step 11 — PandaDoc Config + Scenario C/D Build Playbook
**Project:** Contractor Bid Prep (CBP) / PublicBidPrep Co. (PBP) — DBAs under ISCS
**Date:** June 11, 2026
**Status:** Ready to wire in one sitting once PandaDoc account access clears
**Depends on:** Tier1-SMS-Flow-Spec.md v2.0, CBP_Threads Data Store, Docupilot Template 107439

---

## Table of Contents
1. [PandaDoc API Reference](#1-pandadoc-api-reference)
2. [Module B-6/B-7 Configuration](#2-module-b-6b-7-configuration--pandadoc-create--send-document)
3. [Scenario C — Module-by-Module Build](#3-scenario-c--pandadoc-completion--notion-log)
4. [Scenario D — Module-by-Module Build](#4-scenario-d--48-hour-timeout-check)
5. [Open Items](#5-open-items)

---

## 1. PandaDoc API Reference

### 1.1 Create Document from PDF URL

**Endpoint:** `POST https://api.pandadoc.com/public/v1/documents`
**Content-Type:** `application/json`
**Authorization:** `API-Key {your_api_key}` (header)

This is the call that ingests the Docupilot `file_url` and creates the PandaDoc signature envelope. The PDF URL must be publicly accessible (Docupilot's `file_url` output satisfies this).

**Full request body:**

```json
{
  "name": "Bid Submission — {opportunity_title}",
  "url": "https://docupilot-cdn.example.com/generated/bid-doc.pdf",
  "parse_form_fields": false,
  "tags": ["cbp", "bid-submission"],
  "recipients": [
    {
      "email": "contractor@example.com",
      "first_name": "Contractor First",
      "last_name": "Contractor Last",
      "role": "Signer",
      "signing_order": 1
    },
    {
      "email": "DavidDuncan@contractorbidprep.com",
      "first_name": "David",
      "last_name": "Duncan",
      "role": "CC",
      "recipient_type": "CC"
    }
  ],
  "fields": {},
  "metadata": {
    "thread_id": "THREAD-001",
    "opportunity_title": "Roof Replacement — Escambia County School District",
    "agency_name": "Escambia County School District",
    "contractor_name": "John Smith Roofing",
    "bid_amount": "47500"
  }
}
```

**Key parameter notes:**

- `url` — must be an `https://` URL to a publicly accessible PDF. Docupilot returns this as `file_url` in the API response. Do not use `http://`.
- `parse_form_fields` — set to `false` unless the PDF contains native PDF form fields you want PandaDoc to detect. For Docupilot-generated PDFs, `false` is correct.
- `recipients` — the `role` value for the signer must exactly match a role name defined in your PandaDoc account/template. **Common default is `"user"` in sandbox; confirm the role name in your live account.** For this project, `"Signer"` is used throughout this spec — verify this matches the actual account role before wiring. See Open Items.
- `recipient_type: "CC"` — designates David as a carbon-copy observer rather than a signer. He will receive the completed document via email but will not be prompted to sign.
- `metadata` — a flat key-value object. Any string key, any scalar value. This object **passes through unchanged** into the `document.completed` webhook payload. This is how `thread_id`, `opportunity_title`, etc. survive from Scenario B into Scenario C. All five required values should be included here.
- `fields` — used to pre-fill named field tags embedded in the PDF. Since the Docupilot template already populates all visible text, this can be left as an empty object `{}` unless you add PandaDoc-native signature fields with field tags.

**Response shape (abbreviated):**

```json
{
  "id": "WCfxhXFGhN7rFooeHqQoYN",
  "name": "Bid Submission — Roof Replacement...",
  "status": "document.uploaded",
  "date_created": "2026-06-11T14:23:01.123456Z",
  "date_modified": "2026-06-11T14:23:01.123456Z",
  "links": [
    { "rel": "self", "href": "https://api.pandadoc.com/public/v1/documents/WCfxhXFGhN7rFooeHqQoYN" }
  ]
}
```

After creation, the document is in `document.uploaded` status and **must be explicitly sent** before the contractor receives any signature request email.

---

### 1.2 Send Document (after creation)

**Endpoint:** `POST https://api.pandadoc.com/public/v1/documents/{document_id}/send`
**Content-Type:** `application/json`
**Authorization:** `API-Key {your_api_key}`

```json
{
  "silent": false,
  "subject": "Your Bid Document Is Ready to Sign — {{opportunity_title}}",
  "message": "Hi {{contractor_name}}, your bid submission document for {{opportunity_title}} is attached. Please sign and return at your earliest convenience."
}
```

**Key parameter notes:**

- `silent: false` — PandaDoc sends the signature-request email to the signer automatically. Set to `true` only if you want to suppress the email and handle delivery yourself (not needed here).
- `subject` and `message` — these become the subject line and body of the PandaDoc-generated email to the contractor. The `{{...}}` notation here is illustrative — you will map actual values from upstream modules in Make.com, not use PandaDoc template tokens.
- There is a brief processing delay between document creation and when the document is ready to be sent. Make.com's native PandaDoc module handles this automatically with internal polling. If using an HTTP module instead, you may need to add a brief delay (Sleep module, 3–5 seconds) or poll the document status before calling Send.

---

### 1.3 `document.completed` Webhook Payload

**What triggers it:** All recipients who are Signers have completed their signatures.

**Webhook payload structure** (payload arrives as a JSON **array**, not an object — this is a known PandaDoc quirk):

```json
[
  {
    "event": "document_state_changed",
    "data": {
      "id": "WCfxhXFGhN7rFooeHqQoYN",
      "name": "Bid Submission — Roof Replacement...",
      "status": "document.completed",
      "date_created": "2026-06-11T14:23:01.123456Z",
      "date_modified": "2026-06-11T15:02:44.887654Z",
      "expiration_date": null,
      "created_by": {
        "id": "abc123",
        "email": "DavidDuncan@contractorbidprep.com",
        "first_name": "David",
        "last_name": "Duncan"
      },
      "metadata": {
        "thread_id": "THREAD-001",
        "opportunity_title": "Roof Replacement — Escambia County School District",
        "agency_name": "Escambia County School District",
        "contractor_name": "John Smith Roofing",
        "bid_amount": "47500"
      },
      "tokens": [],
      "fields": {},
      "tags": ["cbp", "bid-submission"],
      "recipients": [
        {
          "id": "recipient_abc",
          "email": "contractor@example.com",
          "first_name": "Contractor First",
          "last_name": "Contractor Last",
          "recipient_type": "SIGNER",
          "has_completed": true,
          "role": "Signer"
        },
        {
          "id": "recipient_xyz",
          "email": "DavidDuncan@contractorbidprep.com",
          "recipient_type": "CC",
          "has_completed": false
        }
      ],
      "total": null,
      "pricing": null
    }
  }
]
```

**Critical notes on this payload:**

1. **Array wrapper** — Make.com's native "Watch Documents" trigger unwraps this automatically. If using a Custom Webhook trigger instead, map from `{{1.[]data.metadata.thread_id}}` (bracket array notation) or handle the array in your mapping.

2. **Metadata location** — your five custom fields appear exactly as passed during document creation at `data.metadata.{key}`. In Make.com, these map as `{{1.data.metadata.thread_id}}`, `{{1.data.metadata.opportunity_title}}`, etc.

3. **Status string** — the event filter condition should match `document.completed` (with dot notation), which appears at `data.status`. The top-level `event` field will be `document_state_changed` (with underscore).

4. **What's in the webhook by default vs. what requires opt-in** — PandaDoc webhook subscriptions have optional payload additions you configure in Dev Center. By default, basic document info and recipients are always included. To ensure `metadata`, `fields`, and `tokens` appear, you must check those boxes when configuring the webhook subscription in PandaDoc's Dev Center → Webhooks → Configure Subscription. **Check "metadata" — this is required for the CBP flow to work.**

---

### 1.4 Webhook Registration

Register in PandaDoc account: **Dev Center → Webhooks → Add Subscription**

- **Payload URL:** The URL generated by Make.com's "Watch Documents" trigger (or a Make.com Custom Webhook URL — see Scenario C build below for which to use)
- **Events to subscribe:** `Document state changed`
- **Additional payload fields to check:** `metadata`, `fields` (check both; `tokens`, `products`, `pricing` are optional)
- **Shared secret:** Optional but recommended. If set, PandaDoc will sign each webhook request with an HMAC header (`x-pandadoc-signature`) that Make can verify. Not required for initial build, but good practice.

---

### 1.5 Recipients — Roles and CC Setup

PandaDoc distinguishes between **Signers** and **CC recipients** at the API level via `recipient_type`.

| Recipient | `role` | `recipient_type` | `signing_order` |
|---|---|---|---|
| Contractor | `"Signer"` (verify in account) | `"SIGNER"` (default if omitted) | `1` |
| David (CBP) | `"CC"` | `"CC"` | omit |

The `role` string in the `recipients` array must correspond to a named role that exists in your PandaDoc account. In the free/trial tier, the default role is often `"user"`. In API-enabled accounts it is typically configurable. **Confirm the exact role string against a live document once account access is restored.** See Open Items §5.1.

CC recipients receive the completed document by email but are not prompted to sign and do not affect the `document.completed` trigger.

---

## 2. Module B-6/B-7 Configuration — PandaDoc Create + Send Document

These two modules sit immediately after the Docupilot module in Scenario B (which produces the `file_url` for the PDF). Source references follow the existing spec: `{{6.xxx}}` = CBP_Threads lookup output (Module 6), `{{12.xxx}}` = bid amount parse output (Module 12). The Docupilot module's `file_url` output is assumed to come from the module immediately preceding B-6 — adjust the module number prefix to match your actual Scenario B sequence.

---

### Module B-6 — PandaDoc: Create a Document

**Make.com module type:** `PandaDoc` → `Create a Document`

> **Fallback note:** If Make.com's native PandaDoc module does not expose a Metadata field in your account's app version, use `HTTP` → `Make a Request` instead (see §2.1 below). The native module is the preferred path.

| Field | Value / Mapping |
|---|---|
| **Connection** | Your PandaDoc API connection (API key: `DavidDuncan@contractorbidprep.com` account) |
| **Document Name** | `Bid Submission — {{6.opportunity_title}}` |
| **Document Source** | `URL` (select this option — not "Template," not "File Upload") |
| **URL** | `{{[Docupilot module number].file_url}}` — the live PDF URL returned by Docupilot module |
| **Parse Form Fields** | `No` / `false` |
| **Recipients** | Add Item 1 (Signer) and Item 2 (CC) — see below |
| **Metadata** | Add key-value pairs — see below |
| **Tags** | `cbp`, `bid-submission` |
| **Fields** | Leave empty |
| **Send Document** | `No` — leave in draft; Module B-7 handles the send |

**Recipients configuration (two items):**

*Item 1 — Contractor (Signer):*
| Sub-field | Value |
|---|---|
| Email | `{{6.contractor_email}}` |
| First Name | `{{6.contractor_name}}` (or split first/last if name is stored split) |
| Last Name | _(leave blank if full name is in contractor_name; see Open Items §5.2)_ |
| Role | `Signer` _(verify exact string against your account — see Open Items §5.1)_ |
| Recipient Type | `SIGNER` |
| Signing Order | `1` |

*Item 2 — David (CC):*
| Sub-field | Value |
|---|---|
| Email | `DavidDuncan@contractorbidprep.com` _(hardcoded)_ |
| First Name | `David` |
| Last Name | `Duncan` |
| Role | `CC` |
| Recipient Type | `CC` |
| Signing Order | _(leave blank)_ |

**Metadata configuration (five key-value pairs):**

| Key | Value |
|---|---|
| `thread_id` | `{{6.thread_id}}` |
| `opportunity_title` | `{{6.opportunity_title}}` |
| `agency_name` | `{{6.agency_name}}` |
| `contractor_name` | `{{6.contractor_name}}` |
| `bid_amount` | `{{12.bid_amount_clean}}` |

These five keys will pass through unchanged into the `document.completed` webhook payload, available at `data.metadata.{key}` in Scenario C.

---

### Module B-7 — PandaDoc: Send a Document

**Make.com module type:** `PandaDoc` → `Send a Document`

| Field | Value / Mapping |
|---|---|
| **Connection** | Same PandaDoc connection as B-6 |
| **Document ID** | `{{B6.id}}` — the `id` returned by Module B-6 |
| **Subject** | `Your Bid Document Is Ready — {{6.opportunity_title}}` |
| **Message** | `Hi {{6.contractor_name}}, your bid submission for {{6.opportunity_title}} is ready for your signature. Please review and sign at your earliest convenience.` |
| **Silent** | `No` (so PandaDoc sends the email to the contractor automatically) |

**Error handling note:** Add an error handler (Ignore or Break) on B-7. If PandaDoc returns a `400 Document is not in the correct state` error, it means B-6's document hasn't finished processing. Set a `Sleep` module (3–5 seconds) between B-6 and B-7 as a buffer if this occurs intermittently.

---

### 2.1 Fallback: HTTP Module Approach for B-6

Use this if the native PandaDoc module does not expose a Metadata field in your Make.com account.

**Module type:** `HTTP` → `Make a Request`

| Field | Value |
|---|---|
| **URL** | `https://api.pandadoc.com/public/v1/documents` |
| **Method** | `POST` |
| **Headers** | `Authorization`: `API-Key {{your_pandadoc_api_key}}` |
| **Body Type** | `Raw` |
| **Content Type** | `application/json` |
| **Request Content** | See JSON below |

```json
{
  "name": "Bid Submission — {{6.opportunity_title}}",
  "url": "{{[Docupilot_module].file_url}}",
  "parse_form_fields": false,
  "tags": ["cbp", "bid-submission"],
  "recipients": [
    {
      "email": "{{6.contractor_email}}",
      "first_name": "{{6.contractor_name}}",
      "role": "Signer",
      "signing_order": 1
    },
    {
      "email": "DavidDuncan@contractorbidprep.com",
      "first_name": "David",
      "last_name": "Duncan",
      "role": "CC",
      "recipient_type": "CC"
    }
  ],
  "metadata": {
    "thread_id": "{{6.thread_id}}",
    "opportunity_title": "{{6.opportunity_title}}",
    "agency_name": "{{6.agency_name}}",
    "contractor_name": "{{6.contractor_name}}",
    "bid_amount": "{{12.bid_amount_clean}}"
  }
}
```

Then Module B-7 (Send): `HTTP` → `Make a Request` to `POST https://api.pandadoc.com/public/v1/documents/{{B6_HTTP_response.id}}/send` with body `{ "silent": false, "subject": "...", "message": "..." }`.

---

## 3. Scenario C — PandaDoc Completion → Notion Log

**Purpose:** When the contractor completes signing in PandaDoc, log the completed bid to Notion Bid Records and update the CBP_Threads record to `status = replied`.

**Scenario name (suggested):** `CBP — Scenario C: PandaDoc Completion → Notion Log`

---

### Module C-1 — Trigger: Watch Documents (PandaDoc)

**Make.com module type:** `PandaDoc` → `Watch Documents`

| Field | Value |
|---|---|
| **Connection** | Your PandaDoc connection |
| **Watch** | `Document state changed` |
| **Status** | `Completed` (i.e., `document.completed`) |
| **Webhook name** | `CBP-document-completed` (label for your reference) |

**How it registers:** When you click "Save" and run the scenario for the first time, Make.com automatically registers a webhook in your PandaDoc account (Dev Center → Webhooks) pointing to a Make.com-generated URL. You do **not** need to manually create the webhook in PandaDoc if you use this module — Make handles it.

**After saving — mandatory manual step in PandaDoc Dev Center:**
1. Log into PandaDoc → Dev Center → Webhooks
2. Find the webhook Make just created (it will have a Make.com URL)
3. Click **Edit**
4. In "Additional payload fields," check: **`metadata`** and **`fields`**
5. Save

This step is required. Without it, the `metadata` object in the webhook payload will be empty (`{}`), and Scenario C will have no `thread_id`, `opportunity_title`, etc.

**Output fields available downstream (key ones):**

| Make.com reference | Value |
|---|---|
| `{{1.data.id}}` | PandaDoc document ID |
| `{{1.data.name}}` | Document name |
| `{{1.data.status}}` | `document.completed` |
| `{{1.data.metadata.thread_id}}` | The thread_id you set during creation |
| `{{1.data.metadata.opportunity_title}}` | Opportunity title |
| `{{1.data.metadata.agency_name}}` | Agency name |
| `{{1.data.metadata.contractor_name}}` | Contractor name |
| `{{1.data.metadata.bid_amount}}` | Bid amount (stored as string) |
| `{{1.data.date_modified}}` | Timestamp of completion |
| `{{1.data.recipients[]}}` | Array of recipient objects |

---

### Module C-2 — Get a Document (PandaDoc) — Optional but Recommended

**Make.com module type:** `PandaDoc` → `Get a Document`

**When to use:** The `Watch Documents` webhook payload contains all the metadata you need for this flow. However, if you want to retrieve the **signed document download URL** (to store in Notion or attach somewhere), you need a separate `Get a Document` call — the download link is not included in the webhook payload.

| Field | Value |
|---|---|
| **Connection** | Your PandaDoc connection |
| **Document ID** | `{{1.data.id}}` |

**What this call adds vs. the webhook payload:**
- A `download_url` (temporary signed URL to download the completed PDF) — useful if you want to store the completed document link in Notion
- More complete `fields` data (if you used PandaDoc field tags)
- `audit_trail` link (premium feature)

**What's already in the webhook and doesn't need this call:**
- All `metadata` fields
- `status`, `name`, `date_modified`
- Recipient completion status

**Recommendation for CBP:** Include C-2 and map `{{2.download_url}}` into the Notion record as a "Signed Document" URL field. This gives David a one-click link in Notion to the executed bid document. Mark this field as optional in Notion (it may expire after 24–72 hours depending on PandaDoc plan).

---

### Module C-3 — Notion: Create Database Item (Bid Records)

**Make.com module type:** `Notion` → `Create a Database Item`

**Database ID:** `02e6f549-c257-4889-bacd-37f29353be12`

| Notion Field | Type | Make.com Mapping |
|---|---|---|
| **Opportunity Name** | Title | `{{1.data.metadata.opportunity_title}}` |
| **Agency** | Text | `{{1.data.metadata.agency_name}}` |
| **Contractor Name** | Text | `{{1.data.metadata.contractor_name}}` |
| **Bid Amount** | Number | `{{parseFloat(1.data.metadata.bid_amount)}}` — convert string to number |
| **Status** | Select | `Submitted` (hardcoded) |
| **Submission Date** | Date | `{{1.data.date_modified}}` — PandaDoc completion timestamp |
| **Thread ID** | Text | `{{1.data.metadata.thread_id}}` |
| **PandaDoc Document ID** | Text | `{{1.data.id}}` |
| **Signed Document URL** | URL | `{{2.download_url}}` _(from C-2, if included)_ |

**Notes:**
- Verify the exact Notion field names match your actual Bid Records database schema. If field names differ, the Notion module will throw an error.
- `Bid Amount` must be mapped as a Number type. Use `parseFloat({{1.data.metadata.bid_amount}})` to convert the string stored in metadata. On Make.com Core plan, `parseFloat()` is available — no issue.
- `Submission Date` — Notion expects ISO 8601 format. PandaDoc's `date_modified` is already ISO 8601 (e.g., `2026-06-11T15:02:44.887654Z`). Map directly; no conversion needed.
- `Status: Submitted` — hardcoded. This field value is "Submitted" for records created by Scenario C (meaning the bid document was signed and submitted). This is distinct from the `replied` status used in CBP_Threads (see C-4).

---

### Module C-4 — CBP_Threads: Update Record (status → replied)

**Make.com module type:** `Data Store` → `Update a Record`

| Field | Value |
|---|---|
| **Data Store** | `CBP_Threads` |
| **Key** | `{{1.data.metadata.thread_id}}` — the `thread_id` from the webhook metadata is the record key in CBP_Threads |
| **status** | `replied` |

**How the key lookup works:** CBP_Threads uses `thread_id` as the record key. The `thread_id` value planted in PandaDoc metadata during Scenario B (`{{6.thread_id}}`) is now extracted from the webhook at `{{1.data.metadata.thread_id}}` and used directly as the key for the Update Record call. No search step is needed — it's a direct key lookup.

**What to update:**
- `status` → set to `replied`
- Optionally add a `completed_at` timestamp: map `{{1.data.date_modified}}` to a `completed_at` field if that field exists in your CBP_Threads schema. Not required but useful for audit purposes.

**Error handling:** Add an error handler on C-4. If the `thread_id` doesn't match any CBP_Threads record (e.g., a document created outside the automation), Make will throw an error. Set to "Ignore" or route to a logging module.

---

### Scenario C — Full Module Summary

```
[C-1] Watch Documents (PandaDoc) — triggers on document.completed
  ↓
[C-2] Get a Document (PandaDoc) — retrieve download URL (optional)
  ↓
[C-3] Notion — Create Database Item — log to Bid Records (02e6f549...)
  ↓
[C-4] Data Store — Update a Record (CBP_Threads, status = replied)
```

---

## 4. Scenario D — 48-Hour Timeout Check

**Purpose:** Catch opportunities where the contractor never replied. Periodically scan CBP_Threads for records that have been `pending` for more than 48 hours, log them to Notion as "No Response," and update the thread status.

**Scenario name (suggested):** `CBP — Scenario D: 48-Hour No-Response Timeout`

---

### Module D-0 — Trigger: Schedule

**Make.com module type:** `Schedule` (built-in trigger)

**Recommended setting: Every 6 hours**

**Tradeoff analysis:**

| Option | Pros | Cons |
|---|---|---|
| **Every 6 hours** | Maximum 6-hour overshoot past the 48h window; contractor flagged promptly | Runs 4× per day; uses more operations (small impact on Core plan) |
| **Daily at 9 AM CT** | Simple, predictable, low operation count | Can overshoot by up to 24 hours if SMS was sent at 10 AM the previous day; a contractor who replied at hour 47:59 would still be flagged |

**Recommendation: Every 6 hours.** On Core plan, Scenario D is lightweight (typically 0–1 records per run after the first few days), so operation cost is negligible. The 6-hour cadence ensures no contractor is flagged more than 6 hours after their actual timeout, which matters if you eventually add a follow-up SMS before no-response logging.

**Schedule configuration:**

| Field | Value |
|---|---|
| **Run scenario** | `Every N hours` |
| **Hours** | `6` |
| **Start time** | `3:00 AM CT` (so runs at 3 AM, 9 AM, 3 PM, 9 PM CT — aligned to work hours for the 9 AM and 3 PM checks) |

---

### Module D-1 — CBP_Threads: Search Records

**Make.com module type:** `Data Store` → `Search Records`

**Data Store:** `CBP_Threads`

**Filter configuration — two conditions, both must be true (AND):**

| Condition | Field | Operator | Value |
|---|---|---|---|
| 1 | `status` | `Equal to` | `pending` |
| 2 | `sent_at` | `Less than or equal to` | `{{addHours(now; -48)}}` |

**Exact formula for the date threshold:**
```
{{addHours(now; -48)}}
```

This returns the Make.com Date object representing the current timestamp minus 48 hours. Records where `sent_at` is at or before this point have been pending for 48+ hours.

**Core-plan compatibility:** ✓ `addHours()` and `now` are both built-in Make.com functions available on all plans, including Core. No premium plan required.

**Maximum number of returned records:** Set to `100` (or the appropriate limit for your volume). Each returned record is processed by the Iterator.

---

### Critical pre-condition: `sent_at` must be stored as a Date type

This is the most likely gotcha for Scenario D. For the `Less than or equal to` date operator to work in the Data Store filter, the `sent_at` field in CBP_Threads must be defined as **type: Date** in the data store schema — not as Text or Number.

**Verify before building:**
1. Open Make.com → Data Stores → CBP_Threads → Edit structure
2. Confirm `sent_at` field type is `Date`
3. If it is currently `Text`, you will need to migrate the field type (this requires recreating the field, as Make.com does not support in-place type changes on data store fields)

**How `sent_at` should be populated in Scenario B (upstream fix if needed):**
When Scenario B writes the initial CBP_Threads record, `sent_at` should be mapped as `{{now}}` — Make.com's current timestamp, which is a native Date object. If it was stored as `formatDate(now; "YYYY-MM-DDTHH:mm:ss")` (a string), the filter will not work. If you find it's stored as a string, the fix in Scenario B is to remove the `formatDate()` wrapper and map `{{now}}` directly.

---

### Caveat: Data Store filter date comparison behavior

Based on known Make.com community reports (analogous to the `replaceAll()` issue already documented for this project), date comparison operators in the Data Store Search Records filter module can behave unexpectedly when:

- The stored value and the comparison value are in different timezone representations
- The stored value is a UTC timestamp and `now` resolves with a local timezone offset

**Mitigation:** Store `sent_at` as UTC (Make.com's `now` function returns UTC by default) and compare against `addHours(now; -48)` (also UTC). As long as both sides of the comparison are UTC Date objects, the operator should work correctly.

If the filter produces unexpected results during testing (e.g., returning no records or returning records that should be excluded), test with a hardcoded threshold value first to isolate whether the issue is the filter logic or the data type.

---

### Module D-2 — Iterator

**Make.com module type:** `Flow Control` → `Iterator`

**Array:** `{{1[]}}` — the array of records returned by D-1's Search Records module

The Iterator unpacks each matching CBP_Threads record individually so that D-3 and D-4 execute once per timed-out thread.

---

### Module D-3 — Notion: Create Database Item ("No Response")

**Make.com module type:** `Notion` → `Create a Database Item`

**Database ID:** `02e6f549-c257-4889-bacd-37f29353be12`

| Notion Field | Type | Make.com Mapping |
|---|---|---|
| **Opportunity Name** | Title | `{{2.opportunity_title}}` _(from Iterator → CBP_Threads record)_ |
| **Agency** | Text | `{{2.agency_name}}` |
| **Contractor Name** | Text | `{{2.contractor_name}}` |
| **Bid Amount** | Number | _(leave blank or map 0 — no bid was submitted)_ |
| **Status** | Select | `No Response` (hardcoded) |
| **Submission Date** | Date | `{{now}}` — date the timeout was detected |
| **Thread ID** | Text | `{{2.thread_id}}` |
| **Notes** | Text | `Contractor did not reply within 48 hours. SMS sent at: {{2.sent_at}}` |

**Note on field name `{{2.xxx}}`:** The prefix `2` here refers to the Iterator module number. In your actual scenario, adjust the module number prefix to match.

---

### Module D-4 — CBP_Threads: Update Record (status → no_response)

**Make.com module type:** `Data Store` → `Update a Record`

| Field | Value |
|---|---|
| **Data Store** | `CBP_Threads` |
| **Key** | `{{2.thread_id}}` _(from Iterator)_ |
| **status** | `no_response` |

This closes the thread in CBP_Threads. Because Scenario D's Search Records filter matches only `status = pending`, once a record is marked `no_response` it will not be picked up on future Scenario D runs.

---

### Scenario D — Full Module Summary

```
[D-0] Schedule — every 6 hours
  ↓
[D-1] Data Store — Search Records (CBP_Threads)
      Filter: status = "pending" AND sent_at ≤ addHours(now; -48)
  ↓
[D-2] Iterator — unpacks each timed-out record
  ↓
[D-3] Notion — Create Database Item (status = "No Response")
  ↓
[D-4] Data Store — Update a Record (CBP_Threads, status = no_response)
```

---

### Scenario D — Core-Plan Function Reference

All functions used in Scenario D are Core-plan compatible:

| Function | Used in | Core plan? | Notes |
|---|---|---|---|
| `addHours(date; number)` | D-1 filter | ✓ Yes | Built-in date function, all plans |
| `now` | D-1 filter, D-3 date | ✓ Yes | Built-in, all plans |
| `parseFloat()` | C-3 bid amount | ✓ Yes | Built-in math function, all plans |
| Date `Less than or equal to` operator | D-1 filter | ✓ Yes | Standard Data Store filter operator |
| `replace()` (nested) | Existing — from v2.0 spec | ✓ Yes | Already confirmed in spec |
| `replaceAll()` | Not used | ✗ Not available | Already flagged in v2.0 spec — not used anywhere in C/D |

---

## 5. Open Items

These are the items that genuinely cannot be resolved without live PandaDoc account access. Nothing below is a guess — these are factual unknowns that require verification in the account.

### 5.1 — Signer Role Name (BLOCKING for B-6 and C-1)

**What's unknown:** The exact string value for the Signer role in your PandaDoc account. The API uses the role name as defined in your account settings, and the default varies by account type:
- Trial/free accounts: often `"user"`
- API-enabled business accounts: often `"Signer"` but configurable

**How to verify:** After account access is restored, go to PandaDoc → Settings → Roles (or create any document manually and inspect the recipient role labels shown in the UI). The string shown in the UI is the exact string to use in the API `recipients[].role` field.

**Where this matters:** Module B-6 `recipients[0].role` value, and potentially the Watch Documents filter in C-1 if filtering by role.

---

### 5.2 — Contractor Name Field Format in CBP_Threads

**What's unknown:** Whether `contractor_name` in CBP_Threads stores a full name (e.g., `"John Smith"`) or separate first/last fields. PandaDoc's API recipients expect `first_name` and `last_name` as separate fields.

**How to resolve:** Check the CBP_Threads data store schema. If `contractor_name` is a single combined field, either:
- Split it in Make.com using `{{substring(6.contractor_name; 0; indexOf(6.contractor_name; " "))}}` for first name and `{{substring(6.contractor_name; add(indexOf(6.contractor_name; " "); 1))}}` for last name
- Or add dedicated `contractor_first_name` and `contractor_last_name` fields to CBP_Threads (cleaner long-term)

---

### 5.3 — PandaDoc Webhook Metadata Checkbox

**What's unknown (requires live account):** Whether the PandaDoc webhook subscription created automatically by Make.com's "Watch Documents" trigger includes metadata in its payload by default, or whether the manual Dev Center checkbox step (described in C-1) is required every time.

**Mitigation already documented:** §3 C-1 includes the manual step. Just confirm it's done — do not skip it during first setup.

---

### 5.4 — PandaDoc Plan Level and `download_url` Availability

**What's unknown:** Whether your PandaDoc plan exposes a `download_url` for completed documents via the Get a Document API call (used in C-2). Some lower-tier plans restrict this.

**If unavailable:** Omit the "Signed Document URL" field from C-3's Notion mapping. All other fields remain unaffected.

---

### 5.5 — Notion Bid Records Field Names

**What's unknown:** The exact field names in the Notion Bid Records database (`02e6f549-c257-4889-bacd-37f29353be12`). The field names in §3 C-3 and §4 D-3 are based on the v2.0 spec — if any were renamed in Notion, the Make.com Notion module will silently fail to populate those fields (no error, just blank).

**How to verify:** After Notion connector is reconnected to the correct workspace, open the database and cross-check field names against the mappings in C-3 and D-3 above.

---

*End of Step 11 Playbook. Next step after account access is restored: wire B-6/B-7 in Scenario B, then build Scenario C and D using this document as the build guide. Notion export of this document to the Tech Spec & Build Log page is deferred until the Notion connector is reconnected to the correct workspace.*
