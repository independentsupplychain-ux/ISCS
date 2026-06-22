# Scenario D — 48-Hour Timeout Check
**Plain-English Make.com Build Walkthrough**
**Date:** June 16, 2026

---

## What this scenario does

Every morning at 9:00 AM CT, this scenario automatically:
1. Scans the CBP_Threads data store for contractors who received an SMS alert more than 48 hours ago but never replied
2. For each one, creates a "No Response" record in the CBP Bid Records Notion database
3. Marks that thread as "no_response" so it won't be flagged again tomorrow

No SMS or email is sent. This is a record-keeping scenario only. You review No Response records in Notion and decide on any follow-up manually.

**Important:** This scenario ignores any thread that Scenario C has already marked as "replied." You don't need to worry about double-logging — the filter handles it.

---

## Step 1 — Create a new scenario

```
What to do:    Open Make.com and create a brand new scenario.
Where to find it: Make.com dashboard → click "+" or "Create a new scenario"
What to enter: Name the scenario: CBP — Scenario D: 48-Hour Timeout Check
```

---

## Step 2 — Set the trigger: Schedule (Module D-1)

```
What to do:    Set this scenario to run automatically every morning at 9:00 AM
               Central Time. There is no webhook here — it fires on a timer.
Where to find it: Click the empty trigger circle → select "Schedule" (it may appear as
               "Clock" or under the built-in tools, not an app search)
What to enter:
  - Select: Advanced scheduling (not "At regular intervals")
  - Time: 09:00
  - Timezone: America/Chicago
  - Days: leave all days checked (runs every day)
  - Click Save
```

---

## Step 3 — Search for timed-out threads (Module D-2)

```
What to do:    Search the CBP_Threads data store for records that are still "pending"
               AND were sent more than 48 hours ago. These are the contractors who
               never replied.
Where to find it: Click "+" after the Schedule trigger → search "Data Store" →
               select "Search Records"
What to enter:
  - Data Store: CBP_Threads
  - Add Filter condition 1:
      Field: status
      Operator: Equal to
      Value: pending

  - Click "Add AND condition" to add a second filter:
      Field: sent_at
      Operator: Less than or equal to
      Value: {{addHours(now; -48)}}
      (Type this formula directly into the value field)
```

---

## Step 4 — Loop through each result (Module D-3)

```
What to do:    Add an Iterator so that the next two steps run once for each
               timed-out thread. Without this, Make.com would only process the
               first result.
Where to find it: Click "+" after Module D-2 → search "Iterator" (it may be under
               "Flow Control" or "Tools") → select "Iterator"
What to enter:
  - Array: click into the field, then select the bundle/array output from Module D-2
    (it will appear as {{2[]}} or similar — select the whole array, not a single field)
```

---

## Step 5 — Log "No Response" to Notion (Module D-4)

```
What to do:    For each timed-out thread, create a record in CBP Bid Records with
               Status = "No Response" to document that no bid was submitted.
Where to find it: Click "+" after Module D-3 → search "Notion" → select "Create a Database Item"
What to enter:
  - Connection: select your Notion connection
  - Database ID: 02e6f549-c257-4889-bacd-37f29353be12
    (CBP Bid Records)

  Map each field as follows:

  Field: Opportunity Name (Title)
  Value: {{3.opportunity_title}}

  Field: Agency
  Value: {{3.agency_name}}

  Field: Contractor Name
  Value: {{3.contractor_name}}

  Field: Bid Amount
  Value: (leave blank — no bid was submitted)

  Field: Submission Date
  Value: {{formatDate(now; "YYYY-MM-DD")}}
  (Type this formula directly — it inserts today's date)

  Field: Status
  Value: No Response
  (Type this directly — do not map a variable)
```

> Note on module numbers: The Iterator is Module 3, so the variables above use `3.` as the prefix. If your scenario shows a different module number for the Iterator, update the prefix accordingly (e.g., `4.opportunity_title` if the Iterator ended up as Module 4).

---

## Step 6 — Mark the thread as "no_response" in the data store (Module D-5)

```
What to do:    Update the CBP_Threads record to "no_response" so tomorrow's
               scan doesn't pick it up again.
Where to find it: Click "+" after Module D-4 → search "Data Store" → select "Update a Record"
What to enter:
  - Data Store: CBP_Threads
  - Key: {{3.thread_id}}
    (Select the thread_id field from the Iterator output)
  - Under "Fields to update":
      Field: status
      New value: no_response
```

---

## Step 7 — Save and test

```
What to do:    Turn on the scenario, then run a manual test to confirm it works
               before letting it run on the live schedule.
Where to find it: Top-right of the scenario editor → toggle the scenario "On"

To test manually:
  1. In the CBP_Threads data store, temporarily insert a test record:
       contractor_name: Test Contractor
       contractor_phone: 8505550000
       status: pending
       sent_at: (set to 3 days ago — e.g., 2026-06-13T09:00:00Z)
       opportunity_title: Test Opportunity
       agency_name: Test Agency
  2. Back in Make.com, click "Run once" (bottom-left of scenario editor)
  3. Check results:

What to check:
  - Module D-2 returns the test record you just inserted
  - A new record appears in CBP Bid Records (Notion) with Status = No Response
    and today's date as Submission Date
  - The test record in CBP_Threads now shows status = no_response
  4. Delete the test record from CBP_Threads when done
```

---

## Testing checklist

- [ ] Schedule set to 09:00 America/Chicago, every day
- [ ] Test record inserted in CBP_Threads with status = pending and sent_at > 48 hours ago
- [ ] Manual "Run once" completed without errors
- [ ] "No Response" record created in CBP Bid Records Notion DB
- [ ] CBP_Threads test record updated to status = no_response
- [ ] Test record deleted from CBP_Threads

---

*Walkthrough version 1.0 — June 16, 2026*
