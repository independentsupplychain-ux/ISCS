# CBP Tally Intake Form — UI Build Guide (Gold Tier)
**Date:** June 16, 2026
**Use this guide in:** Tally.so form editor
**What you're doing:** Adding 6 new fields to the existing Gold-tier intake form, with conditional logic that shows or hides each field based on the contractor's answers.

---

## Before you start

Open your existing Gold-tier form in Tally.so. Find the section that comes after the basic contact fields (Name, Company, Phone, Email). All 6 new fields go **after** Email and **before** the Stripe payment / submit step.

---

## Field 1 — State

```
What to add:   A dropdown question
Label:         "What state do you primarily work in?"
Options:       Florida
               Alabama
Conditional:   Always visible — no conditions
Required:      Yes
```

**How to add in Tally:** Click "+" to add a block → select Dropdown → type the label → add both options.

---

## Field 2 — Trade(s)

```
What to add:   A multi-select checkboxes question
               (contractors can pick more than one)
Label:         "What trade(s) are you licensed in?"
Options:       Roofing
               General Contracting
               HVAC
               Electrical
               Plumbing
Conditional:   Always visible — no conditions
Required:      Yes
```

**How to add in Tally:** Click "+" → select Multiple Choice → enable "Allow multiple selections" → type the label and each option.

---

## Field 3 — License Class *(FL contractors only)*

```
What to add:   A dropdown question
Label:         "What type of contractor's license do you hold in Florida?"
Options:       Certified (statewide)
               Registered (county-limited)
Helper text:   "Certified licenses are issued by the state and cover all of Florida.
               Registered licenses are local and limited to the county where you registered."
Required:      Yes (when visible)
```

**Conditional logic — show this field only when:**
- Field 1 (State) = Florida

**How to set conditional logic in Tally:**
1. Click on this field to select it
2. Click the "Conditional Logic" icon (branching arrows, usually in the right panel or toolbar)
3. Set: Show this field IF → State → is → Florida
4. Save the condition

---

## Field 4 — License Number

```
What to add:   A short text input
Label:         "Enter your contractor's license number"
Placeholder:   e.g. CCC1234567
Helper text:   "License numbers typically start with 2–3 letters followed by 7 digits.
               Enter exactly as shown on your license."
Conditional:   Always visible — no conditions
Required:      Yes
```

**How to add in Tally:** Click "+" → select Short Text → type the label and placeholder text.

---

## Field 5 — Eligible Counties *(Registered FL contractors only)*

```
What to add:   A multi-select checkboxes question
Label:         "Which counties are you licensed to work in?"
Options:       Escambia
               Santa Rosa
               Okaloosa
               Walton
               Bay
               Gulf
               Franklin
               Leon
Required:      Yes (when visible)
```

**Conditional logic — show this field only when:**
- Field 3 (License Class) = Registered (county-limited)

**How to set in Tally:**
1. Click on this field
2. Open Conditional Logic
3. Set: Show this field IF → License Class → is → Registered (county-limited)
4. Save

---

## Field 6 — State GC License? *(Alabama + General Contracting only)*

```
What to add:   A Yes/No toggle (or single-choice with Yes / No options)
Label:         "Do you hold an Alabama state General Contractor's license?"
Options:       Yes
               No
Helper text:   "Alabama requires a state GC license for all public projects regardless
               of contract size. Without one, you won't qualify for public bids."
Required:      Yes (when visible)
```

**Conditional logic — show this field only when BOTH are true:**
- Field 1 (State) = Alabama
- Field 2 (Trade(s)) includes General Contracting

**How to set in Tally:**
1. Click on this field
2. Open Conditional Logic
3. Add condition 1: State → is → Alabama
4. Click "Add condition" and set it to AND (not OR)
5. Add condition 2: Trade(s) → contains → General Contracting
6. Save

**Important:** Do NOT set this field to block form submission if the answer is No. Leave the form submittable regardless of the answer. David follows up with "No" respondents separately.

---

## Summary: Where each field sits in the form

| Position | Field | Always shown? | Condition to show |
|---|---|---|---|
| After Email | State | Yes | — |
| | Trade(s) | Yes | — |
| | License class | No | State = Florida |
| | License number | Yes | — |
| | Eligible counties | No | License Class = Registered |
| | State GC license? | No | State = Alabama AND Trade includes GC |
| Before payment | *(existing payment step)* | — | — |

---

## After you build the form — Notion connection check

These fields need to flow into Notion via your Make.com Tally webhook. Confirm the field names in Tally's output match what Make.com expects to map to these Notion properties:

| Tally field label | Notion property |
|---|---|
| State | State |
| Trade(s) | Trade(s) |
| License class | License Class |
| License number | License Number |
| Eligible counties | Eligible Counties |
| State GC license? (Yes) | State GC License (AL) = checked |
| State GC license? (No) | State GC License (AL) = unchecked |

---

*UI Guide version 1.0 — June 16, 2026*
