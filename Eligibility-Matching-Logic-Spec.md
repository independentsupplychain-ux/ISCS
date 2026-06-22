# Contractor Eligibility Matching Logic Spec
**Project:** Contractors BidBuddy / PublicBidPrep Co.
**Date:** June 15, 2026
**Status:** Spec complete — pending David review before any Notion schema changes

---

## 1. Notion DB Schema Changes — CBP Client Profiles

**Database ID:** `4ad603ac-a8c0-4282-ae1b-4d898abd15e7`

Add the following properties to the **CBP Client Profiles** database. Do not modify or remove existing properties.

| Property Name | Notion Type | Options / Notes |
|---|---|---|
| `Trade` | Select | Roofing / GC / HVAC / Electrical / Plumbing |
| `License Class` | Select | Certified / Registered *(FL contractors only — leave blank for AL contractors)* |
| `License Number` | Text | Full license number as issued by DBPR (FL) or ALCLB (AL) |
| `Eligible Counties` | Multi-select | Populate only when `License Class = Registered`. List each county by name (e.g., Escambia, Santa Rosa, Okaloosa). Leave blank if Certified. |
| `State GC License (AL)` | Checkbox | Check = contractor holds an AL General Contractor license and is eligible for public-bid matching. Uncheck = exclude from all AL public-bid matching. Only relevant for AL-based contractors. |

**Pilot contractor entry (pre-fill):**

| Property | Value |
|---|---|
| `Trade` | Roofing *(primary)* / GC *(secondary)* |
| `License Class (Roofing)` | Certified |
| `License Class (GC)` | Registered |
| `License Number (Roofing)` | `[CCC number — confirm with contractor]` |
| `License Number (GC)` | `[RG number — confirm with contractor]` |
| `Eligible Counties` | `[Confirm counties on RG license — e.g., Escambia, Santa Rosa]` |
| `State GC License (AL)` | *(confirm — leave unchecked until verified)* |

> **Note on multi-trade contractors:** The current schema uses one row per contractor. If a contractor holds multiple trades with different license classes (e.g., Certified Roofing + Registered GC), store the more permissive class in `License Class` and document the secondary license in `License Number` with a note. A cleaner multi-trade schema (one row per license per contractor) is deferred to the multi-client expansion — it's over-engineered for the pilot.

---

## 2. Matching Logic Rules

These rules run **per opportunity, per contractor** as a filter/router step in Scenario A (Outbound SMS Sender), between Module A-4 (dedup check) and Module A-6 (SMS send). They do not replace the dedup check — they run after it.

---

### Rule 1 — FL Certified: Statewide Eligibility

**Condition:**
- Contractor's `License Class = Certified`
- Contractor's `Trade` matches the opportunity's trade category

**Result:** Contractor is eligible for **all FL Gulf Coast opportunities** for that trade. No county filter applied.

```
IF contractor.License_Class == "Certified"
   AND opportunity.state == "FL"
   AND opportunity.trade_category == contractor.Trade
THEN eligible = true
```

---

### Rule 2 — FL Registered: County-Limited Eligibility

**Condition:**
- Contractor's `License Class = Registered`
- Contractor's `Trade` matches the opportunity's trade category
- The opportunity's `Agency County` is listed in contractor's `Eligible Counties`

**Result:** Contractor is eligible only for opportunities where the agency is in a county they are licensed to work in.

```
IF contractor.License_Class == "Registered"
   AND opportunity.state == "FL"
   AND opportunity.trade_category == contractor.Trade
   AND opportunity.agency_county IN contractor.Eligible_Counties
THEN eligible = true
ELSE eligible = false
```

> **Data dependency:** Scraper output must include an `agency_county` field for FL opportunities. Verify this field exists in DemandStar/MFMP scraper output. If not present, it must be derived from `agency_name` via a lookup table or added to the scraper.

---

### Rule 3 — AL Contractor: GC License Required for All Public Work

**Condition:**
- Opportunity is in AL (`opportunity.state == "AL"`)
- Contractor's `State GC License (AL)` checkbox is **unchecked**

**Result:** Contractor is **excluded** from all AL public-bid matching, regardless of trade or estimated value.

```
IF opportunity.state == "AL"
   AND contractor.State_GC_License_AL == false
THEN eligible = false  // exclude — stop processing, do not send SMS
```

**Rationale:** Under Act 2024-277 (eff. Oct 2024), Alabama requires a state GC license for ANY public project, regardless of dollar value. Sub-threshold contractors (those who only needed a license for private work above $100K) are categorically ineligible for public bids. Routing opportunities to them would waste their attention and expose CBP to credibility risk.

---

### Rule 4 — AL Contractor with GC License: Statewide Eligibility

**Condition:**
- Opportunity is in AL
- Contractor's `State GC License (AL)` checkbox is **checked**
- Contractor's `Trade` matches the opportunity's trade category

**Result:** Contractor is eligible. AL has no Certified/Registered split — all AL licensed contractors have statewide eligibility.

```
IF opportunity.state == "AL"
   AND contractor.State_GC_License_AL == true
   AND opportunity.trade_category == contractor.Trade
THEN eligible = true
```

---

### Rule 5 — Trade Mismatch (Any State): Exclude

**Condition:**
- Opportunity's trade category does not match contractor's `Trade`

**Result:** Exclude — do not send SMS regardless of license class or county.

```
IF opportunity.trade_category != contractor.Trade
THEN eligible = false
```

---

## 3. Eligibility Decision Flow

```
START: New opportunity from scraper
  |
  v
[A-4] Dedup check → SKIP if already sent
  |
  v
[NEW] Rule 5: Trade match?
  ├── No → SKIP (trade mismatch)
  └── Yes ↓
        |
        v
      State = FL?
      ├── Yes ↓
      |     License Class?
      |     ├── Certified → ELIGIBLE (statewide)
      |     └── Registered → Check agency_county IN Eligible_Counties?
      |           ├── Yes → ELIGIBLE
      |           └── No  → SKIP (county mismatch)
      |
      └── State = AL? ↓
            State GC License (AL) checked?
            ├── No  → SKIP (no AL public-work license)
            └── Yes → ELIGIBLE (statewide)
  |
  v
[A-6] Send SMS
```

---

## 4. Pipeline Integration Notes

**Where it slots in:** Between Module A-4 (dedup check) and Module A-6 (SMS send) in Scenario A.

**Make.com implementation approach:**
- After A-4 confirms the opportunity is new, add a **Notion → Get a Record** module to fetch the contractor's profile from the CBP Client Profiles DB using their `contractor_id` (stored in `BidBuddy_ActiveThreads`).
- Add a **Router** module with eligibility filter conditions based on the rules above.
- Route 1 (eligible) → A-6 (SMS send)
- Route 2 (ineligible) → skip (connect to end of iterator, no SMS)

**Multi-client expansion note:** In the pilot, Module A-2 hardcodes one contractor. When multi-client matching is built, the Notion lookup replaces Module A-2 and feeds the eligibility router automatically. The matching logic rules above are designed to work in that expanded context without modification.

**Opportunity schema dependency:**
The following fields must be present in each opportunity record for this logic to execute:

| Field | Required By | Notes |
|---|---|---|
| `state` | Rules 1–4 | "FL" or "AL" |
| `agency_county` | Rule 2 | Required for Registered contractor matching in FL. Verify in scraper output. |
| `trade_category` | Rule 5 | Must map to the same values used in contractor `Trade` select field. Define a canonical trade taxonomy (see below). |

**Trade taxonomy (canonical values — use these consistently in both scraper output and Notion):**

| Canonical Value | Covers |
|---|---|
| Roofing | All roofing scopes |
| GC | General contracting, site work |
| HVAC | Mechanical, HVAC |
| Electrical | Electrical |
| Plumbing | Plumbing |

---

## 5. Open Questions for David

1. **`agency_county` field in scraper output** — Does the DemandStar/MFMP scraper currently return a county field? If not, this is a required scraper enhancement before Rule 2 can execute.

2. **`trade_category` field in scraper output** — How are opportunities categorized by trade today? Is there a NIGP code, NAICS code, or keyword tag in the scraper output that maps to the trade taxonomy above?

3. **Pilot contractor's RG license counties** — Which counties appear on the pilot contractor's Registered GC license? This is needed to populate `Eligible Counties` in Notion.

4. **AL eligibility for pilot** — Does the pilot contractor hold an AL state GC license? Check before setting the `State GC License (AL)` checkbox.

5. **Multi-license contractors** — If the pilot contractor (or future clients) hold the same trade as both Certified and Registered (unusual but possible), the rule should favor Certified (statewide). Add a note to the Notion DB instructions to document this if it comes up.

---

*Spec version 1.0 — June 15, 2026. Ready for David review. No Notion schema changes should be made until David confirms.*
