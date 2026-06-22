# Scenario C — PandaDoc Completion → Notion Log
**Plain-English Make.com Build Walkthrough**
**Date:** June 16, 2026

---

## What this scenario does

When a contractor signs a bid document in PandaDoc, this scenario automatically:
1. Receives a signal from PandaDoc that the document was signed
2. Pulls the full document details (including the bid amount and contractor info)
3. Logs the completed bid to the CBP Bid Records database in Notion
4. Marks the open thread in the CBP_Threads data store as "replied" so the 48-hour timeout (Scenario D) ignores it

**Before you start:** Confirm that Scenario B's Module B-6 is setting metadata on PandaDoc documents. If it isn't, Steps 4 and 5 below will produce blank fields.

---

## Step 1 — Create a new scenario

```
What to do:    Open Make.com and create a brand new scenario (not a copy of an existing one).
Where to find it: Make.com dashboard → click the blue "+" or "Create a new scenario" button
What to enter: Name the scenario: CBP — Scenario C: PandaDoc Completion
```

---

## Step 2 — Add the trigger: Custom Webhook (Module C-1)

```
What to do:    Add a webhook module as the first (trigger) step. This gives you a unique URL
               that PandaDoc will call every time a document is signed.
Where to find it: Click the empty trigger circle → search "Webhooks" → select "Custom Webhook"
What to enter:
  - Click "Add" to create a new webhook
  - Name: CBP PandaDoc Completion
  - Click Save
  - COPY the webhook URL that appears — you will need it in the next step
```

---

## ⛔ STOP — Paste the webhook URL into PandaDoc now

Before building the rest of the scenario, go to PandaDoc and register this URL:

1. Log into PandaDoc
2. Go to **Settings → Integrations → Webhooks**
3. Click **Add webhook**
4. Paste the URL you just copied from Make.com
5. Set the event to: `document.completed`
6. Save

Come back to Make.com once this is done. Make.com will wait for PandaDoc to send a test payload before you can map the fields in later steps — complete a test document signature in PandaDoc to send that payload.

---

## Step 3 — Get the document details from PandaDoc (Module C-2)

```
What to do:    Add a module that fetches the full document record from PandaDoc,
               including the metadata fields that hold the bid amount, contractor
               name, opportunity title, etc.
Where to find it: Click the "+" after Module C-1 → search "PandaDoc" → select "Get a Document"
What to enter:
  - Connection: select your PandaDoc connection (or add it: PandaDoc API key is under
    PandaDoc → Settings → API → Public API keys)
  - Document ID: click into the field, select the variable from Module 1 → data → id
    (it will appear as {{1.data.id}})
```

---

## Step 4 — Log the bid to Notion (Module C-3)

```
What to do:    Create a new record in the CBP Bid Records Notion database to log
               that this bid was submitted and signed.
Where to find it: Click "+" after Module C-2 → search "Notion" → select "Create a Database Item"
What to enter:
  - Connection: select your Notion connection
  - Database ID: 02e6f549-c257-4889-bacd-37f29353be12
    (This is the CBP Bid Records database)

  Map each field as follows (click the field, then select the variable from the panel):

  Field: Opportunity Name (Title)
  Value: {{2.metadata.opportunity_title}}

  Field: Agency
  Value: {{2.metadata.agency_name}}

  Field: Contractor Name
  Value: {{2.metadata.contractor_name}}

  Field: Bid Amount
  Value: {{parseNumber(2.metadata.bid_amount)}}
  (Type this formula directly — it converts the text value to a number)

  Field: Submission Date
  Value: {{formatDate(1.data.date_completed; "YYYY-MM-DD")}}
  (Type this formula directly)

  Field: Status
  Value: Submitted
  (Type this word directly — do not map a variable)
```

> If any of the metadata fields come through blank in a test run, the issue is in Scenario B Module B-6, not here. Fix B-6 first.

---

## Step 5 — Close the thread in the data store (Module C-4)

```
What to do:    Find the open thread for this contractor in the CBP_Threads data store
               and mark it as "replied" so Scenario D's timeout check skips it.
Where to find it: Click "+" after Module C-3 → search "Data Store" → select "Update a Record"
What to enter:
  - Data Store: CBP_Threads
  - Search method: Search by field (not by key)
  - Search field: contractor_phone
  - Search value: {{2.metadata.contractor_phone}}
  - Add a second condition:
      Field: status
      Operator: Equal to
      Value: pending

  - Under "Fields to update":
      Field: status
      New value: replied
```

---

## Step 6 — Save and test

```
What to do:    Turn on the scenario and send a test document through PandaDoc to verify
               that all four modules fire correctly.
Where to find it: Top-right of the scenario editor → toggle the scenario "On" →
               use PandaDoc's test webhook feature or complete a real document signature
What to check afterward:
  - Module C-2 returns metadata fields (opportunity_title, bid_amount, etc.)
    If blank → fix Scenario B Module B-6
  - A new record appears in CBP Bid Records (Notion) with correct Opportunity Name,
    Agency, Bid Amount, and Status = Submitted
  - The matching CBP_Threads record now shows status = replied
```

---

## Testing checklist

- [ ] Webhook URL pasted into PandaDoc (event: document.completed)
- [ ] Test document signed in PandaDoc to send payload to Make.com
- [ ] Module C-2 returns populated metadata fields
- [ ] New Bid Record created in Notion — Status = Submitted
- [ ] CBP_Threads record for this contractor updated to status = replied

---

*Walkthrough version 1.0 — June 16, 2026*
