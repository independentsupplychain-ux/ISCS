# Tally.so Gold-Tier Intake Form — Updated Field Spec
**Project:** Contractors BidBuddy / PublicBidPrep Co.
**Date:** June 15, 2026
**Purpose:** Capture license data at signup so the eligibility-matching logic has data to work with.
**Form tier:** Gold tier intake only (Silver tier does not need license-class routing)

---

## Overview of New Fields

Five new fields are added to the existing Gold-tier intake form. All are required unless noted as conditional. They feed directly into the `Trade`, `License Class`, `License Number`, `Eligible Counties`, and `State GC License (AL)` properties of the CBP Client Profiles Notion DB.

---

## Field Definitions

---

### Field 1 — State of Operation

**Field type:** Single select (or radio buttons)
**Label:** "What state do you primarily work in?"
**Options:**
- Florida
- Alabama
- Both FL and AL

**Required:** Yes
**Purpose:** Gates the conditional fields below. FL contractors see License Class and Issuing County questions. AL contractors see the State GC License question instead.

---

### Field 2 — Trade(s)

**Field type:** Multi-select checkboxes
**Label:** "What trade(s) are you licensed in?"
**Options:**
- Roofing
- General Contracting (GC)
- HVAC / Mechanical
- Electrical
- Plumbing

**Required:** Yes
**Notes:** Allow multi-select — contractors can hold licenses in more than one trade. Maps to `Trade` in Notion (if multi-trade, document each in the profile note field).

---

### Field 3 — License Class (FL Contractors Only)

**Field type:** Single select (or radio buttons)
**Label:** "What type of contractor's license do you hold in Florida?"
**Options:**
- Certified (valid statewide — I can work anywhere in FL)
- Registered (county-limited — I work in specific counties only)
- Not sure — I'll look it up

**Required:** Yes *(conditional — show only if Field 1 = "Florida" or "Both FL and AL")*

**Conditional logic:**
- Show if: `Field 1 == "Florida"` OR `Field 1 == "Both FL and AL"`
- Hide if: `Field 1 == "Alabama"`

**Help text (display under the question):**
> "Certified licenses (prefix: CGC, CCC, CMC, CFC, EC) allow you to bid anywhere in Florida. Registered licenses (prefix: RG, RC, RM, RF, ER) are limited to specific counties. Not sure? Check your license at the DBPR website using your license number."

**Maps to:** `License Class` in Notion Client Profiles DB

---

### Field 4 — License Number

**Field type:** Short text
**Label:** "Enter your Florida contractor's license number"
**Placeholder:** e.g., CCC1234567 or RC1234567
**Required:** Yes *(conditional — show only if Field 1 = "Florida" or "Both FL and AL")*

**Conditional logic:** Same as Field 3.

**Validation note (for Tally):** Tally does not have native regex validation — add a help text line:
> "License numbers typically start with 2–3 letters followed by 7 digits (e.g., CCC1234567). Enter exactly as shown on your license."

**Maps to:** `License Number` in Notion

---

### Field 5 — Licensed Counties (Registered Contractors Only)

**Field type:** Long text (free entry) OR multi-select checkboxes
**Label:** "Which counties are listed on your Registered license?"
**Placeholder:** e.g., Escambia, Santa Rosa, Okaloosa, Walton
**Required:** Yes *(conditional — show only if Field 3 = "Registered")*

**Conditional logic:**
- Show if: `Field 3 == "Registered"`
- Hide if: `Field 3 == "Certified"` or `Field 3 == "Not sure"`

**Help text:**
> "List all counties where you're authorized to work. You can find this on your DBPR license record. Separate multiple counties with commas."

**Multi-select option (alternative):** If Tally supports a long multi-select, pre-populate with Gulf Coast FL counties: Escambia, Santa Rosa, Okaloosa, Walton, Bay, Washington, Holmes, Jackson, Calhoun, Gulf, Franklin, Liberty, Gadsden, Leon, Jefferson, Madison, Taylor, Wakulla, Hamilton, Suwannee. This makes entry faster but limits responses to the counties we've pre-loaded.

**Maps to:** `Eligible Counties` in Notion

---

### Field 6 — Alabama State GC License (AL Contractors Only)

**Field type:** Single select (or radio buttons)
**Label:** "Do you hold an Alabama state General Contractor's license?"
**Options:**
- Yes — I am licensed with the Alabama Contractors Licensing Board (ACLB)
- No — I do not hold an AL state GC license

**Required:** Yes *(conditional — show only if Field 1 = "Alabama" or "Both FL and AL")*

**Conditional logic:**
- Show if: `Field 1 == "Alabama"` OR `Field 1 == "Both FL and AL"`
- Hide if: `Field 1 == "Florida"`

**Help text:**
> "Alabama requires a state GC license for all public projects, regardless of dollar value (Act 2024-277). Without it, you are not eligible for government contract opportunities through our service — but you can still enroll and we'll flag this for follow-up."

**Important UX note:** Do NOT block signup if the answer is "No." Capture the response and flag the record in Notion. David handles outreach to explain the requirement and potentially help them get licensed. Excluding them at signup loses a lead.

**Maps to:** `State GC License (AL)` checkbox in Notion (Yes = checked, No = unchecked)

---

## Conditional Logic Summary

| Field | Show Condition | Hide Condition |
|---|---|---|
| Field 3 — License Class | State = FL or Both | State = AL |
| Field 4 — License Number | State = FL or Both | State = AL |
| Field 5 — Licensed Counties | State = FL or Both AND License Class = Registered | License Class = Certified or Not Sure |
| Field 6 — AL GC License | State = AL or Both | State = FL |

---

## Field Order in Form

Place these fields after the contractor's basic contact info (name, phone, email, company) and before any billing/tier selection fields. Suggested order:

1. *(existing)* Full Name
2. *(existing)* Company Name
3. *(existing)* Phone Number
4. *(existing)* Email Address
5. **[NEW] State of Operation** (Field 1)
6. **[NEW] Trade(s)** (Field 2)
7. **[NEW] License Class** (Field 3 — conditional: FL)
8. **[NEW] License Number** (Field 4 — conditional: FL)
9. **[NEW] Licensed Counties** (Field 5 — conditional: Registered)
10. **[NEW] AL GC License** (Field 6 — conditional: AL)
11. *(existing)* Any remaining fields / Stripe payment

---

## Notion Mapping Reference

| Tally Field | Notion Property | Notion Type |
|---|---|---|
| Trade(s) | `Trade` | Select *(multi-trade: use primary trade, note others)* |
| License Class | `License Class` | Select |
| License Number | `License Number` | Text |
| Licensed Counties | `Eligible Counties` | Multi-select |
| AL GC License (Yes) | `State GC License (AL)` | Checkbox = true |
| AL GC License (No) | `State GC License (AL)` | Checkbox = false |

---

## Open Questions for David

1. **Tally → Notion integration:** Are these Tally fields being mapped to Notion automatically via a Make.com scenario, or is David entering them manually per signup? If automated, the Make.com Tally webhook module will need to parse the conditional fields and map them to the right Notion properties.

2. **Multi-trade handling:** If a contractor selects both Roofing (Certified) and GC (Registered), Tally captures both but Notion's `Trade` field is a single Select. Options: (a) store primary trade in `Trade` and put secondary license info in a `Notes` text field, or (b) upgrade to a multi-select. Confirm before building.

3. **"Not sure" on License Class:** If a contractor selects "Not sure," the eligibility router cannot fire until the record is corrected. Flag these records in Notion with a status of "License Class Pending" and add a follow-up task for David to verify via DBPR lookup.

4. **AL contractor without GC license:** Should the form display a message after they select "No" on Field 6 that explains the requirement, or just capture and move on? A brief inline note (not a blocker) is recommended for transparency without losing the lead.

---

*Spec version 1.0 — June 15, 2026. Ready for David to build in Tally.so UI.*
