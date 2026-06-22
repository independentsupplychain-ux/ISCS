# Scenario C — PandaDoc Completion → Notion Log
**Make.com Build Guide**
**Date:** June 16, 2026
**Trigger:** PandaDoc `document.completed` webhook

---

## Overview

When a contractor signs a bid document in PandaDoc, this scenario fires, retrieves the completed document's metadata, logs the bid to the CBP Bid Records Notion database, and marks the corresponding thread in the `CBP_Threads` data store as replied.

**Prerequisite:** Scenario B must set metadata fields on each PandaDoc document at creation time (Module B-6). If those fields are missing, modules C-3 and C-4 will produce empty values. Verify B-6 before testing this scenario.

---

## Module C-1 — Webhooks: Custom Webhook

**Module type:** Webhooks → Custom Webhook

1. Add this as the first module in the scenario.
2. Click **Add** to create a new webhook. Name it `CBP PandaDoc Completion`.
3. Copy the generated webhook URL.

> **STOP — manual step required:**
> Paste this URL into your PandaDoc account:
> PandaDoc → Settings → Integrations → Webhooks → Add webhook
> - Event: `document.completed`
> - URL: *(paste the webhook URL from Make.com)*
> - Save the webhook.

**Key payload fields Make.com will receive:**

| Path | Value |
|---|---|
| `data.id` | PandaDoc document ID |
| `data.name` | Document name |
| `data.status` | `document.completed` |
| `data.date_completed` | ISO timestamp |
| `data.metadata.*` | Custom fields set in Scenario B |

---

## Module C-2 — PandaDoc: Get Document

**Module type:** PandaDoc → Get a Document

1. Connect your PandaDoc account (API key from PandaDoc → Settings → API → Public API keys).
2. **Document ID:** `{{1.data.id}}`

This retrieves the full document object, including all metadata fields that were embedded at creation in Scenario B. The metadata is what drives the Notion mapping in C-3.

---

## Module C-3 — Notion: Create a Database Item

**Module type:** Notion → Create a Database Item

**Database ID:** `02e6f549-c257-4889-bacd-37f29353be12` (CBP Bid Records)

**Field mappings:**

| Notion Property | Value | Notes |
|---|---|---|
| Opportunity Name (Title) | `{{2.metadata.opportunity_title}}` | From PandaDoc metadata |
| Agency | `{{2.metadata.agency_name}}` | From PandaDoc metadata |
| Contractor Name | `{{2.metadata.contractor_name}}` | From PandaDoc metadata |
| Bid Amount | `{{parseNumber(2.metadata.bid_amount)}}` | Converts string to number |
| Submission Date | `{{formatDate(1.data.date_completed; "YYYY-MM-DD")}}` | ISO date from webhook |
| Status | `Submitted` | Hardcode this value |

> If any of the `metadata.*` fields are blank after a test run, the problem is in Scenario B Module B-6. Fix B-6 before continuing.

---

## Module C-4 — Data Store: Update a Record

**Module type:** Data Store → Update a Record

**Data Store:** `CBP_Threads`

**Search configuration:**
- Search by field: `contractor_phone`
- Value: `{{2.metadata.contractor_phone}}`
- Add a second filter: `status` equals `pending`

**Update:**
- Field: `status`
- New value: `replied`

This closes the loop on the active thread so Scenario D's 48-hour timeout check skips it.

---

## Testing Checklist

- [ ] Trigger a real PandaDoc document completion (or use PandaDoc's test webhook feature)
- [ ] Confirm C-2 returns metadata fields set by Scenario B
- [ ] Confirm a new Bid Record appears in Notion with correct Opportunity Name, Agency, Bid Amount, and Status = Submitted
- [ ] Confirm the matching `CBP_Threads` record has `status = replied`

---

*Guide version 1.0 — June 16, 2026*
