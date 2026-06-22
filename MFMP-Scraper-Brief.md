# MFMP Scraper Feasibility Brief
**Project:** Contractors BidBuddy / PublicBidPrep Co. (ISCS)
**Brief:** B — Step 8
**Date:** June 8, 2026
**Target:** MyFloridaMarketPlace (MFMP) — Florida state procurement portal
**Reference:** DemandStar Scraper Feasibility Brief (Brief A, same folder)

> **Context from Brief A:** DemandStar was confirmed as a publicly accessible, scrapeable source covering Gulf Coast county and city agencies (Pensacola, Tallahassee, Escambia, Leon, Mobile area). MFMP is the state-level companion — it covers Florida state agency procurement. DemandStar is primary; MFMP is secondary and additive.

---

## Public Access Status

**Verdict: Two separate public-facing systems exist. Both are accessible without login for browsing solicitations. Coverage is state agencies only — county/city coverage is limited.**

Florida operates two procurement bid-listing systems, which serve overlapping but distinct purposes. Understanding which system to target — and its scope limitations — is critical before committing to a scraper build.

### System A — MFMP Vendor Information Portal (VIP) [Newer]

| Property | Detail |
|---|---|
| URL | `https://vendor.myfloridamarketplace.com/search/bids` |
| Login required to browse? | No — publicly accessible |
| Technology | Modern web application (SPA characteristics; JavaScript rendering likely) |
| Coverage | Florida STATE agencies only: ITB, RFP, ITN, single-source notices |
| Managed by | Florida Department of Management Services (DMS) |

The VIP is the current official face of MFMP for vendors. It advertises all formal competitive solicitations posted by Florida state agencies. Based on confirmed URLs and DMS documentation, bid listings are publicly viewable without account credentials — login is required only to formally register interest, receive notifications, and download solicitation documents.

### System B — Vendor Bid System (VBS) [Legacy, Server-Rendered]

| Property | Detail |
|---|---|
| Main menu URL | `https://www.myflorida.com/apps/vbs/vbs_www.main_menu` |
| Search form URL | `https://www.myflorida.com/apps/vbs/vbs_www.search.criteria_form` |
| Login required to browse? | No — fully public |
| Technology | Server-rendered HTML (old .form URL pattern — no JavaScript required) |
| Coverage | Florida STATE agencies only — same scope as VIP |
| Managed by | Florida DMS; VBS has been the historical public bid listing since early 2000s |

VBS is the legacy system and notably the **most scraper-friendly** — it is server-rendered HTML, meaning Cheerio Scraper or basic HTTP requests can retrieve results without a browser. The search form accepts POST parameters including agency, NIGP code, and date range. VBS is still actively used for advertising solicitations as of 2025–2026.

### Critical Scope Note: MFMP/VBS Covers State Agencies, NOT County/City Agencies

This is the most important finding for the BidBuddy use case. MFMP and VBS are **Florida's state eProcurement system** — they handle purchasing by state agencies (FDOT, FDEP, Florida DOH, state universities, etc.). County governments, city governments, school districts, and municipal agencies procure independently and do **not** post to MFMP/VBS.

The Gulf Coast target agencies — Escambia County, Santa Rosa County, Leon County, City of Pensacola, City of Tallahassee, and Mobile area (AL) — post their bids to **DemandStar** (confirmed in Brief A), not to MFMP. MFMP adds supplementary coverage for large state contracts (FDOT paving, FDEP environmental work, state university maintenance) that may be relevant to roofing/GC/HVAC/electrical contractors, but it does not replace DemandStar for local Gulf Coast coverage.

---

## Available Data Fields

### MFMP VIP (`vendor.myfloridamarketplace.com/search/bids`)

| Field | Availability | Notes |
|---|---|---|
| Solicitation title | ✅ Public | Displayed in bid listing cards |
| Agency name | ✅ Public | State agency that posted the bid |
| Solicitation type | ✅ Public | ITB / RFP / ITN / Single Source |
| Solicitation number | ✅ Public | Used as dedup key |
| Posted date | ✅ Public | When bid was advertised |
| Due / closing date | ✅ Public | Bid submission deadline |
| NIGP commodity code | ✅ Public | 5-digit NIGP codes used throughout FL state procurement |
| Estimated contract value | ⚠️ Uncertain | Not confirmed publicly available; may be in bid detail only |
| Bid documents (PDFs, specs) | 🔒 Login required | Registration required to download documents |
| Vendor communications (Q&A) | 🔒 Login required | Addenda and Q&A responses require account |

### VBS Legacy System (`myflorida.com/apps/vbs/`)

| Field | Availability | Notes |
|---|---|---|
| Solicitation title | ✅ Public | Visible in search results |
| Agency name | ✅ Public | Agency dropdown in search form |
| Solicitation number | ✅ Public | Shown in results list |
| NIGP commodity code | ✅ Public | Filter available in search form |
| Posted / due dates | ✅ Public | Date range filter and result display |
| Solicitation type | ✅ Public | Shown in results |
| Direct document link | ✅ Public (for some) | Some solicitations link directly to public PDF |
| Estimated value | ⚠️ Uncertain | Not a standard VBS result field |

**For the Make.com pipeline:** The public fields available from both systems are sufficient for the weekly alert (title, agency, due date, NIGP code, portal link). MFMP adds state-agency scope that DemandStar does not cover, making it a useful secondary source for contractors who also want FDOT or state agency work.

---

## Apify Actor Options

**No existing MFMP or VBS actor found on Apify Store.** A full search returned no results for "myfloridamarketplace," "MFMP," or "Florida VBS" by name or variant. This is consistent with Brief A's findings — government procurement portals (other than SAM.gov and BidNet Direct) are underrepresented in the Apify store.

### Recommended Build Path: Two-Tier Approach

Because two separate systems exist with different technical characteristics, the recommended approach differs for each:

**Tier 1 — VBS Legacy Scraper (Build First)**

VBS is server-rendered HTML. This means:
- **Apify Cheerio Scraper** (`apify/cheerio-scraper`) is sufficient — no browser needed
- Submit a POST or GET request to the search form with NIGP codes and agency parameters
- Parse returned HTML for bid listings
- Much simpler, faster, and cheaper to run than a Playwright-based actor
- Complexity: **Low** — 2–4 hours to build a working actor

Search form parameters (confirmed from VBS URL structure and DMS documentation):
- Agency: state agency dropdown
- NIGP code: 5-digit Florida commodity code
- Date range: posted/closed date filters
- Solicitation type: ITB / RFP / ITN

**Tier 2 — VIP Scraper (Optional, Build Later)**

MFMP VIP at `vendor.myfloridamarketplace.com/search/bids` is likely JavaScript-rendered (modern web app). If Cheerio doesn't work:
- Use **Apify Playwright Scraper** (`apify/playwright-scraper`) — same approach recommended for DemandStar in Brief A
- Intercept XHR/fetch API calls for structured JSON data
- Complexity: **Medium** — 4–6 hours to build

**Recommendation:** Start with VBS (Cheerio-based, fast build, fully confirmed public). Add VIP scraper in a second iteration once VBS is live and producing data.

---

## API / Feed Alternatives

### No public API or data feed confirmed for MFMP or VBS

After research across MFMP documentation, Florida DMS pages, and public records, no structured public API or data feed was found for open procurement solicitations:

| Alternative | Status | Notes |
|---|---|---|
| MFMP / VBS public API | ❌ Not found | No documented API endpoint for open solicitations |
| RSS feed (MFMP or VBS) | ❌ Not found | No RSS feed discovered in DMS documentation |
| Downloadable CSV/Excel export | ❌ Not confirmed | Not found in public-facing DMS portal |
| Email notification service | ✅ Available (with registration) | Free vendor registration enables NIGP-code-matched email alerts — not useful for pipeline automation |

### Florida FACTS System (Awarded Contracts — Not Solicitations)

**FACTS** (Florida Accountability Contract Tracking System) at `https://facts.fldfs.com` is Florida's transparency portal for awarded state contracts. It is publicly accessible, searchable by agency and commodity code, and provides downloadable data.

**FACTS is NOT useful for the BidBuddy pipeline.** It covers contracts that have already been awarded — not open solicitations seeking bids. It would be useful for competitive intelligence (who won similar contracts, at what price) but is not a source of actionable bid opportunities.

### Florida Open Data / data.myflorida.com

Florida operates open data portals, but procurement solicitation data (open bids) does not appear to be published as a structured data set through Florida's open data initiative. Contract award data may be available, but open solicitations are not.

### Alternative: Florida BidNet Direct

For the Gulf Coast region specifically, **BidNet Direct** (`bidnetdirect.com/florida`) is an alternative aggregator that collects Florida state AND local bid opportunities — including county and city bids. It covers overlapping geography with both DemandStar and MFMP. An Apify actor for BidNet Direct **does exist** on the Apify store (`parseforge/governmentbids-scraper` and `jungle_synthesizer/bidnetdirect-government-bids-scraper`). This is worth evaluating as a supplementary or fallback source if MFMP scraping proves unreliable.

---

## Bottom Line

**Status: Buildable without login — VBS is the recommended build target. Coverage caveat: state agencies only.**

MFMP/VBS is publicly accessible for solicitation browsing without credentials. The key architectural insight is that there are **two systems** to consider, and the legacy VBS is significantly easier to scrape (server-rendered HTML, Cheerio-compatible) than the newer VIP (JavaScript SPA, Playwright required).

**The most important finding for the BidBuddy Gulf Coast use case:** MFMP/VBS covers Florida **state agency** procurement only — not county or city agencies. The county and city agencies that are the primary Gulf Coast targets (Escambia, Leon, Santa Rosa counties; City of Pensacola; City of Tallahassee) post their bids on DemandStar, not MFMP. This aligns with the original brief's guidance that DemandStar is primary and MFMP is secondary.

**Recommended build sequence:**
1. **Build VBS scraper first** (Cheerio-based, low complexity, 2–4 hours) — covers state agency work (FDOT, FDEP, FL DEP, state universities)
2. **DemandStar scraper (Brief A) handles county/city coverage** — these are the primary Gulf Coast targets
3. **Add VIP scraper as Iteration 2** (Playwright-based, 4–6 hours) if VBS coverage proves insufficient
4. **Evaluate BidNet Direct** as a potential single aggregator that covers both state and local FL opportunities, and has a pre-built Apify actor

**No API or feed shortcut exists** — scraping is the only automated path for MFMP/VBS bid data.

**Estimated build time:** 2–4 hours for a VBS Cheerio actor; 4–6 hours for a full VIP Playwright actor. Running both in parallel with DemandStar gives comprehensive FL + AL state-and-local coverage.

---

*Brief produced by Cowork — June 8, 2026*
*Reference: DemandStar Scraper Feasibility Brief (Brief A, Step 7, same folder)*
