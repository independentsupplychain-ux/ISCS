# CBP Tally Intake Form — Field Spec (Gold Tier)
**Date:** June 16, 2026
**Purpose:** Reference for building the Gold-tier intake form in Tally.so UI.
**Scope:** Add these fields to the existing Gold-tier form, after basic contact info, before billing/payment.

---

## New Fields to Add

| # | Field label | Field type | Conditional logic |
|---|---|---|---|
| 1 | State | Dropdown | Always visible. Options: Florida, Alabama |
| 2 | Trade(s) | Multi-select checkboxes | Always visible. Options: Roofing, General Contracting, HVAC, Electrical, Plumbing |
| 3 | License class | Dropdown | Show only if State = Florida |
| 4 | License number | Short text | Always visible. Placeholder: e.g. CCC1234567 |
| 5 | Eligible counties | Multi-select checkboxes | Show only if License Class = Registered |
| 6 | State GC license? | Yes/No toggle | Show only if State = Alabama AND Trade includes General Contracting |

---

## Field Details

### Field 3 — License Class (FL only)
**Options:** Certified (statewide), Registered (county-limited)

**Helper text:**
> "Certified licenses are issued by the state and cover all of Florida. Registered licenses are local and limited to the county where you registered."

**Conditional logic:** Show if State = Florida. Hide if State = Alabama.

---

### Field 5 — Eligible Counties (Registered only)
**Options (multi-select checkboxes):** Escambia, Santa Rosa, Okaloosa, Walton, Bay, Gulf, Franklin, Leon

**Conditional logic:** Show if License Class = Registered. Hide if License Class = Certified.

---

### Field 6 — State GC License? (AL + GC only)
**Options:** Yes / No

**Helper text:**
> "Alabama requires a state GC license for all public projects regardless of contract size. Without one, you won't qualify for public bids."

**Conditional logic:** Show if State = Alabama AND Trade includes General Contracting.

**Important:** Do NOT block form submission if the answer is No. Capture the response and flag the Notion record for David to follow up. Excluding them at signup loses a lead.

---

## Field Order in Form

Place after basic contact info (Name, Phone, Email, Company) and before payment:

1. *(existing)* Full Name
2. *(existing)* Company Name
3. *(existing)* Phone Number
4. *(existing)* Email Address
5. **[NEW] State** (Field 1)
6. **[NEW] Trade(s)** (Field 2)
7. **[NEW] License class** (Field 3 — conditional: FL)
8. **[NEW] License number** (Field 4)
9. **[NEW] Eligible counties** (Field 5 — conditional: Registered)
10. **[NEW] State GC license?** (Field 6 — conditional: AL + GC)
11. *(existing)* Stripe payment / submit

---

## Notion Mapping

These fields feed contractor-opportunity matching logic in Make.com Scenario A.

| Tally field | Notion property | Notion type |
|---|---|---|
| State | State | Select |
| Trade(s) | Trade(s) | Multi-select |
| License class | License Class | Select |
| License number | License Number | Text |
| Eligible counties | Eligible Counties | Multi-select |
| State GC license? (Yes) | State GC License (AL) | Checkbox = true |
| State GC license? (No) | State GC License (AL) | Checkbox = false |

---

*Spec version 1.1 — June 16, 2026. Supersedes the table in Tally-Intake-Form-Spec.md for Gold-tier form build reference.*
