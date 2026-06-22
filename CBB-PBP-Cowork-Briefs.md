# CBB/PBP — Cowork Task Briefs
**Project:** Contractors BidBuddy / PublicBidPrep Co. (DBAs under ISCS)
**Date:** June 8, 2026
**Instructions:** Run each brief as a separate Cowork task. Complete them in order — Brief B depends on context from Brief A. Brief C can run in parallel.

---

## BRIEF A — Step 7: DemandStar Apify Scraper Feasibility

**Goal:** Research and produce a scraper feasibility brief for DemandStar Gulf Coast bid opportunities using Apify. Deliver a finished Markdown document.

### Background
DemandStar is a government procurement portal used by city, county, and school district agencies across FL and AL. The target geography is the Gulf Coast corridor — Escambia County to Leon County, FL (Pensacola → Tallahassee), plus coastal AL (Mobile area). The relevant trades are roofing, general contracting, HVAC, and electrical. This scraper will feed a weekly automated report pipeline via Make.com.

### Research Tasks
1. Confirm whether DemandStar has a public-facing bid listing page accessible without login. Note the exact URL structure and whether bids are paginated.
2. Document which data fields are visible without authentication: opportunity title, agency name, due date, estimated value, trade/category codes, and portal link.
3. Search the Apify Store (apify.com/store) for any existing DemandStar actor. Note actor name, last updated date, star rating, and number of runs if found.
4. If no actor exists, assess whether a generic Apify actor (Web Scraper, Cheerio Scraper, or Playwright Scraper) could handle the page — note any JavaScript rendering requirements, pagination behavior, or login walls encountered.
5. Identify how to filter results geographically to the Gulf Coast FL/AL region — is this a URL parameter, an on-page filter, or a post-scrape filter applied in Make.com?
6. List the relevant commodity/trade category codes on DemandStar for: roofing, general contracting, HVAC, electrical.

### Deliverable
Save as `DemandStar-Scraper-Brief.md` in this folder.

Structure the document with these sections:
- **Public Access Status** — login required or not, URL structure
- **Available Data Fields** — what's scrapeable
- **Apify Actor Options** — existing actor or build-your-own path
- **Geography Filter Method** — how to scope to Gulf Coast
- **Trade Category Codes** — relevant codes for target trades
- **Bottom Line** — one of: Ready to build / Needs workaround (describe it) / Blocked (describe why)

### Notion Export Step
After saving the file, open the Notion page at this URL and paste the full content of `DemandStar-Scraper-Brief.md` as a new section titled **"DemandStar Scraper Feasibility Brief"** under the existing content:

**Notion page:** https://app.notion.com/p/356e9419689781598716f765b2fde8f9

*(This is the ⚙️ GovBid — Tech Spec & Build Log page inside the BidBuddy HQ.)*

---

## BRIEF B — Step 8: MFMP Apify Scraper Feasibility

**Goal:** Research and produce a scraper feasibility brief for MyFloridaMarketPlace (MFMP) using Apify. Deliver a finished Markdown document.

### Background
MFMP (vendor.myfloridamarketplace.com) is Florida's state procurement portal. Unlike DemandStar, it is suspected to be login-gated. This brief determines whether scraping is viable, or whether a fallback approach is needed. DemandStar (Brief A) is the primary data source — MFMP is secondary and should be deprioritized if it cannot be accessed without credentials.

### Research Tasks
1. Check whether MFMP has any publicly accessible solicitation search pages without vendor login. Test: vendor.myfloridamarketplace.com and any linked public bid search URLs.
2. Document which data fields are visible publicly vs. require login.
3. Search the Apify Store for any existing MFMP actor.
4. Check whether MFMP offers a public RSS feed, open API, or downloadable data export that bypasses the login wall. Check fl.gov, myflorida.com procurement documentation, and Florida DMS (Department of Management Services) pages.
5. Check whether Florida has a separate state-level procurement transparency portal or open data feed (e.g. through Florida's open data initiative) that publishes solicitation data overlapping with MFMP.
6. Note: SAM.gov covers federal opportunities — this research is specifically for state/local FL procurement only.

### Deliverable
Save as `MFMP-Scraper-Brief.md` in this folder.

Structure the document with these sections:
- **Public Access Status** — what's accessible without login
- **Available Data Fields** — public vs. login-gated
- **Apify Actor Options** — existing or viable custom build
- **API / Feed Alternatives** — any public data access paths
- **Bottom Line** — one of: Buildable without login / Buildable with vendor credentials (note what's needed) / Blocked — use fallback (describe recommended fallback)

### Notion Export Step
After saving the file, open the same Notion page and paste the full content of `MFMP-Scraper-Brief.md` as a new section titled **"MFMP Scraper Feasibility Brief"** directly below the DemandStar section added in Brief A:

**Notion page:** https://app.notion.com/p/356e9419689781598716f765b2fde8f9

---

## BRIEF C — Step 9: Tier 1 Two-Way SMS Flow Spec

**Goal:** Write a complete, buildable technical specification for the Tier 1 two-way SMS automation flow. This document is what gets handed directly to the builder (David) to configure in Make.com. Deliver a finished Markdown document.

### Background
**Stack:** Make.com (orchestration), Twilio (SMS in/out), Docupilot (bid doc generation), PandaDoc (e-signature), Notion (bid records logging via Make.com native module).

**Trigger:** A weekly Apify scraper run (Sunday 7:45 PM CT) produces a list of government bid opportunities. Make.com picks these up and sends outbound SMS alerts to enrolled contractors.

**Pilot scope:** One contractor (brother-in-law, roofing/GC). The system should be designed for one client but architected to support multiple in a future iteration.

**Contractor's only job:** Receive the SMS, reply with their bid dollar amount. Everything else is automated.

### Spec Must Cover

1. **Outbound SMS (Make.com → Twilio → Contractor)**
   - Make.com module sequence to format and send the outbound Twilio SMS
   - Message content template: opportunity name, agency, due date, estimated value, portal link, and a plain-English prompt ("What would you charge for this job? Reply with your number.")
   - Character count consideration — keep under 160 characters or note if MMS is needed

2. **Inbound Webhook (Contractor reply → Twilio → Make.com)**
   - Twilio webhook configuration to catch contractor's SMS reply
   - How the webhook payload passes to Make.com (URL, method, key fields)
   - How Make.com identifies which opportunity the reply corresponds to (session/thread management)

3. **Filter / Router Logic (Make.com)**
   - If reply is a clean numeric value (integer or decimal, with or without $ sign): route to Docupilot
   - If reply is non-numeric or ambiguous: route to manual review queue
   - Manual review: flag in Notion (create a "Review Needed" record), send email notification to David with contractor name, opportunity, and raw reply text

4. **Docupilot Trigger**
   - Data fields passed to Docupilot: contractor name, contractor email, opportunity title, agency name, due date, estimated contract value, contractor's bid amount
   - What the generated bid document should contain (cover page, bid amount, contractor info, opportunity reference)
   - Make.com module configuration for Docupilot API call

5. **PandaDoc Handoff**
   - How Make.com triggers PandaDoc to send signature request to contractor's email
   - Recipient configuration (contractor signs; David as sender)
   - Document routing after signature complete

6. **Notion Bid Records Logging**
   - On PandaDoc signature completion, Make.com logs to Notion Bid Records database
   - Fields to log: opportunity name, agency, contractor name, bid amount, submission date, status = "Submitted"
   - Make.com native Notion module — no webhook needed
   - Notion Bid Records database is embedded in the BidBuddy HQ page (ID: 356e9419-6897-81df-8754-e4729d6ceaae)

7. **Edge Cases**
   - Non-numeric reply: handling described in section 3 above — document the exact Make.com filter expression
   - No reply / timeout: what happens if contractor doesn't reply within 48 hours (flag as "No Response" in Notion, no further action)
   - Duplicate opportunity: if same opportunity appears in two consecutive weekly scrapes, suppress duplicate SMS to contractor
   - Multiple opportunities in one week: each opportunity = separate SMS thread

### Deliverable
Save as `Tier1-SMS-Flow-Spec.md` in this folder.

Structure the document as:
- **Flow Overview** — one-paragraph plain English summary of the full flow
- **Module-by-Module Build Sequence** — numbered steps matching Make.com scenario build order, each with: module name, configuration notes, data field mappings
- **Make.com Filter Expressions** — exact syntax for the numeric/non-numeric router
- **Data Field Reference Table** — all variables in the flow, their source, and where they land
- **Edge Case Handling** — one section per edge case above
- **Open Questions for David** — anything that requires a decision before build can start (e.g. Docupilot template design, PandaDoc account setup, contractor email collection method)

### Notion Export Step
After saving the file, open the same Notion page and paste the full content of `Tier1-SMS-Flow-Spec.md` as a new section titled **"Tier 1 Two-Way SMS Flow Spec"** directly below the MFMP section:

**Notion page:** https://app.notion.com/p/356e9419689781598716f765b2fde8f9

---

## Notes for Cowork

- Run Brief A first. Brief B can reference any findings from Brief A regarding DemandStar vs. MFMP access patterns.
- Brief C is independent and can run in parallel with A and B.
- All three output files land in this same folder. Notion export is the final step for each brief — do not skip it.
- The Notion page linked above (Tech Spec & Build Log) is inside the BidBuddy & PublicBidPrep Co. HQ. Append content below existing page content — do not overwrite anything already there.
- If Notion login is required, pause and flag for David before proceeding with the export step.
