# Scenario D — 48-Hour Timeout Check
**Make.com Build Guide**
**Date:** June 16, 2026
**Trigger:** Schedule — daily at 9:00 AM CT

---

## Overview

Every morning, this scenario scans the `CBP_Threads` data store for threads that are still `pending` and were sent more than 48 hours ago. For each one, it logs a "No Response" record in the CBP Bid Records Notion database and marks the thread as `no_response`. No SMS or email is sent — this is a record-keeping scenario only.

---

## Module D-1 — Schedule

**Module type:** Schedule (built-in trigger)

**Settings:**
- Interval: Advanced scheduling
- Time: `09:00`
- Timezone: `America/Chicago`
- Days: Every day (leave all days checked)

---

## Module D-2 — Data Store: Search Records

**Module type:** Data Store → Search Records

**Data Store:** `CBP_Threads`

**Filter conditions (both must match):**

| Field | Operator | Value |
|---|---|---|
| `status` | Equal to | `pending` |
| `sent_at` | Less than or equal to | `{{addHours(now; -48)}}` |

This returns all threads that were sent over 48 hours ago and have not received a contractor reply (Scenario C would have set `status = replied` if they had responded).

---

## Module D-3 — Iterator

**Module type:** Tools → Iterator (or Flow Control → Iterator)

**Array:** `{{2[]}}` — the full array of records returned by D-2

The Iterator feeds each matching thread record individually into D-4 and D-5.

---

## Module D-4 — Notion: Create a Database Item

**Module type:** Notion → Create a Database Item

**Database ID:** `02e6f549-c257-4889-bacd-37f29353be12` (CBP Bid Records)

**Field mappings:**

| Notion Property | Value | Notes |
|---|---|---|
| Opportunity Name (Title) | `{{3.opportunity_title}}` | From data store record |
| Agency | `{{3.agency_name}}` | From data store record |
| Contractor Name | `{{3.contractor_name}}` | From data store record |
| Bid Amount | *(leave blank)* | No response received |
| Submission Date | `{{formatDate(now; "YYYY-MM-DD")}}` | Today's date |
| Status | `No Response` | Hardcode this value |

> **Note:** The iterator is module 3 in the chain (D-1 Schedule → D-2 Data Store → D-3 Iterator → D-4 Notion). Adjust the module number prefix (`3.`) if your scenario numbering differs.

---

## Module D-5 — Data Store: Update a Record

**Module type:** Data Store → Update a Record

**Data Store:** `CBP_Threads`

**Key:** `{{3.thread_id}}` — the unique ID of the timed-out thread

**Update:**
- Field: `status`
- New value: `no_response`

This prevents the same thread from being flagged again on future runs.

---

## No further action

After D-5, the scenario ends. No SMS or email is sent for timeouts. David reviews No Response records in Notion manually to decide on follow-up.

---

## Testing Checklist

- [ ] Insert a test record in `CBP_Threads` with `status = pending` and `sent_at` set to 3 days ago
- [ ] Run the scenario manually (click Run once in Make.com)
- [ ] Confirm D-2 returns the test record
- [ ] Confirm a "No Response" Bid Record appears in the CBP Bid Records Notion DB
- [ ] Confirm the data store record now has `status = no_response`
- [ ] Delete the test record from `CBP_Threads`

---

*Guide version 1.0 — June 16, 2026*
