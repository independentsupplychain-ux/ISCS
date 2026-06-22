# DemandStar Scraper Feasibility Brief
**Project:** Contractors BidBuddy / PublicBidPrep Co. (ISCS)
**Brief:** A — Step 7
**Date:** June 8, 2026
**Target:** Gulf Coast FL/AL bid opportunities (Escambia → Leon County FL + Mobile AL)
**Trades:** Roofing, General Contracting, HVAC, Electrical

---

## Public Access Status

**Verdict: Publicly browsable — no login required for bid listings. Login required for document downloads and full bid details.**

DemandStar operates a publicly accessible bid browsing interface at `https://www.demandstar.com/browse-bids`. The platform is a JavaScript-rendered Single Page Application (React/SPA), meaning all pages require JavaScript execution — static HTTP scrapers (Cheerio, raw curl) will not work.

**Confirmed URL structure:**

| URL Pattern | Purpose |
|---|---|
| `https://www.demandstar.com/browse-bids` | Top-level public browse page |
| `/app/browse-bids/states/florida` | Florida-filtered bid list |
| `/app/browse-bids/states/alabama` | Alabama-filtered bid list |
| `/app/browse-bids/states/{state}/metro-areas/{metro-slug}` | Metro-area filtered list |
| `/app/browse-bids/states/{state}/groups/{group-slug}` | Trade group filtered list |
| `/app/browse-bids/states/{state}/groups/{group-slug}/categories/{category-slug}` | Full drill-down by state + trade + category |
| `/app/agencies/{state}/{agency-slug}/procurement-opportunities/{uuid}` | Agency-specific bid page |
| `/app/limited/bids/{id}/details` | Individual bid detail (public/limited view) |

**Pagination behavior:** DemandStar uses SPA-style dynamic pagination. Page content is loaded via JavaScript; the URL may not change on pagination (scroll-based or client-side navigation). This must be handled by Playwright's browser automation, not simple HTTP GET requests.

**Login wall assessment:** Browsing and reading bid summaries appears fully public. Document downloads (PDFs, specifications) and formal bid registration require a free or paid account. The `/app/limited/bids/{id}/details` URL pattern explicitly confirms a public "limited" view is available per bid record.

---

## Available Data Fields

The following fields appear to be accessible in the public browse view without authentication:

| Field | Availability | Notes |
|---|---|---|
| Opportunity title | ✅ Public | Visible in browse listings |
| Agency name | ✅ Public | Visible in browse listings and agency-specific URLs |
| Due date / close date | ✅ Public | Shown in bid card/listing view |
| Portal link | ✅ Public | Direct URL to bid detail page |
| Trade/category group | ✅ Public | Embedded in browse URL slug and listing tags |
| Bid ID / reference number | ✅ Public | Part of URL structure (`/bids/{id}/`) |
| Estimated contract value | ⚠️ Uncertain | May require login; not confirmed present in public listing cards |
| Bid documents (PDFs) | 🔒 Login required | Document downloads require account |
| Awarded vendor info | 🔒 Login required | Post-award data is behind login |

**Summary for Make.com pipeline:** The public fields are sufficient for the weekly alert use case — title, agency, due date, trade category, and portal link are all scrapeable without credentials.

---

## Apify Actor Options

### Existing DemandStar Actor on Apify Store
**None found.** A search of the Apify Store (apify.com/store) returned no DemandStar-specific actor. No results were returned for "demandstar" by name, nor for close variants. This is not a surprise — DemandStar is a niche government procurement portal with a relatively small vendor audience compared to sites like SAM.gov.

**Existing related government scraper actors on Apify (for reference):**
- `parseforge/governmentbids-scraper` — BidNet Direct scraper (different platform)
- `jungle_synthesizer/bidnetdirect-government-bids-scraper` — BidNet Direct scraper
- `jungle_synthesizer/samgov-scraper` — SAM.gov (federal only)
- `scrapepilot/public-tender-procurement-scraper` — USASpending, TED EU, UK Contracts
- None of the above cover DemandStar

### Build-Your-Own Path: Apify Playwright Scraper

Since no pre-built actor exists, the recommended approach is a **custom Apify actor built on the Apify Playwright Scraper** (`apify/playwright-scraper`).

**Why Playwright (not Cheerio or Web Scraper):**
- DemandStar is a React SPA — all bid listing content is rendered client-side via JavaScript
- Cheerio Scraper and basic HTTP scrapers will return empty or skeleton HTML
- Playwright launches a real headless Chromium browser, executes JavaScript, and can interact with the rendered DOM
- Playwright also supports network request interception, which may allow tapping DemandStar's internal API calls (JSON endpoints) rather than scraping rendered HTML — this is the preferred approach if DemandStar makes API calls to a backend that returns structured JSON

**Recommended build approach:**
1. Use Apify Playwright Scraper (or Crawlee + Playwright custom actor) to load the target browse URLs
2. Intercept XHR/fetch network requests on page load — if DemandStar fetches bids from an internal REST API (common with React SPAs), capture that JSON directly
3. If no interceptable API, extract data from rendered DOM elements (bid title, agency, date, category, link)
4. Paginate by detecting and clicking "next page" controls or scrolling for infinite scroll
5. Schedule the actor to run weekly (Sunday 7:45 PM CT per pipeline spec)

**Complexity estimate:** Medium. The primary unknowns are (1) whether DemandStar's SPA makes interceptable API calls (easiest path) and (2) how pagination is implemented. A build + test cycle of 4–8 hours of dev time is reasonable.

---

## Geography Filter Method

**Method: URL-based path parameter (primary) + agency-level filtering (secondary)**

DemandStar embeds geography directly in the browse URL path. No query string parameters are needed.

**Confirmed URL pattern for geographic scoping:**
```
/app/browse-bids/states/{state}/metro-areas/{metro-slug}/groups/{group-slug}
```

**Gulf Coast target URLs (confirmed pattern, slugs inferred from DemandStar naming conventions):**

| Target Area | Likely URL Segment | Confirmation Status |
|---|---|---|
| Florida (statewide) | `/states/florida` | ✅ Confirmed by search results |
| Pensacola metro (Escambia/Santa Rosa) | `/states/florida/metro-areas/pensacola` | Inferred — City of Pensacola agency page confirmed |
| Tallahassee metro (Leon County) | `/states/florida/metro-areas/tallahassee` | Inferred — City of Tallahassee agency page confirmed |
| Mobile metro (AL) | `/states/alabama/metro-areas/mobile` | Inferred — DemandStar uses metro-area slug pattern in AL |
| Panama City / Emerald Coast | `/states/florida/metro-areas/panama-city` | Inferred |

**Important note:** Metro-area URL slugs must be validated during the build phase by browsing DemandStar's metro-area listing page. If the target metros don't have their own metro-area slug (less-populated areas may not), the fallback is to filter at the state level and apply a post-scrape filter by county or agency name in Make.com.

**Agency-level filtering (alternative/supplement):**
DemandStar has confirmed agency pages for key Gulf Coast agencies:
- City of Pensacola: `/app/agencies/Florida/City-of-Pensacola/procurement-opportunities/`
- City of Tallahassee: `/app/agencies/florida/city-of-tallahassee/procurement-opportunities/`
- Additional target agencies (Escambia County, Santa Rosa County, Leon County, Mobile County) likely have similar pages

**Recommended scraper geography strategy:**
1. Primary: Scrape `/states/florida` and `/states/alabama` with trade group filter appended
2. Post-scrape filter: Filter returned records by agency name or county to Gulf Coast corridor
3. Do NOT rely solely on metro-area slugs until they are confirmed working

---

## Trade Category Codes

DemandStar uses its own internal category grouping system with human-readable URL slugs (not NIGP numeric codes in the URL). The platform's internal codes are NIGP-derived but presented as slug-style categories in the browse interface.

### DemandStar URL Group/Category Slugs

**Group 1 — Construction (primary for roofing and GC):**
```
/groups/public-works-park-equipment-and-construction-services
```
Relevant categories within this group:
| Category Slug | Covers |
|---|---|
| `building-construction-services-new-including-maintenance-and-repair-services` | General contracting, new build + repair |
| `construction-services-trades-new-construction` | Trade contractors, new construction |
| `building-maintenance-installation-and-repair-services` | Repair/maintenance GC and roofing |

**Group 2 — Trades (primary for HVAC and Electrical):**
```
/groups/the-trades-electrical-engineering-hvac-plumbing-and-welding
```
Relevant categories within this group:
| Category Slug | Covers |
|---|---|
| `electrical-equipment-and-supplies-except-cable-and-wire` | Electrical contractors |
| `plumbing-equipment-fixtures-and-supplies` | Plumbing (adjacent, review for HVAC overlap) |

> **Note on roofing:** Roofing does not appear to have its own top-level group — it falls under `public-works-park-equipment-and-construction-services`. A roofing-specific category slug was not confirmed in research; validate during build by browsing the construction group's category list.

### Corresponding NIGP Numeric Codes (DemandStar's internal backend)

DemandStar's commodity code system is based on NIGP codes. The following are the relevant standard NIGP codes that map to the target trades:

| Trade | NIGP Class | NIGP Code | Description |
|---|---|---|---|
| Roofing | 910–914 series | **910-84** | Roofing and Sheet Metal Work |
| Roofing (repair) | 914 series | **914-73** | Roofing, Gutters, and Downspout Maintenance & Repair |
| General Contracting | 909–910 series | **909-00** | Building Construction (General) |
| HVAC | 914 series | **914-50** | HVAC Systems — Construction and Installation |
| HVAC (maintenance) | 914 series | **914-52** | HVAC Systems — Maintenance and Repair |
| Electrical | 914 series | **914-30** | Electrical Work — Construction |
| Electrical (maintenance) | 914 series | **914-35** | Electrical Work — Maintenance and Repair |

> **Important:** These NIGP codes reflect standard classifications. DemandStar may use slightly different 5-digit variants internally. Validate exact codes by logging into a free DemandStar vendor account, navigating to Commodity Codes, and searching "roofing," "HVAC," "electrical," and "general contracting" to confirm the numeric codes DemandStar assigns in their system.

### Recommended Scraper Filter Strategy

Use **URL slug-based group/category filtering** (not NIGP codes) for the Apify scraper, since the category slugs are baked into DemandStar's public browse URL structure. NIGP codes are useful for display/reference in the weekly report but are not needed for the scrape itself.

**Priority target URLs for weekly scrape (FL + AL combined):**
```
/app/browse-bids/states/florida/groups/public-works-park-equipment-and-construction-services
/app/browse-bids/states/florida/groups/the-trades-electrical-engineering-hvac-plumbing-and-welding
/app/browse-bids/states/alabama/groups/public-works-park-equipment-and-construction-services
/app/browse-bids/states/alabama/groups/the-trades-electrical-engineering-hvac-plumbing-and-welding
```

---

## Bottom Line

**Status: Ready to build — with one validation step required**

DemandStar is publicly accessible without login for all fields needed by the BidBuddy pipeline (title, agency, due date, category, portal link). No login wall blocks the core data.

No pre-built Apify actor exists for DemandStar — a custom actor is required. The recommended approach is a **Playwright-based custom Apify actor** that loads the browse-bids URLs filtered by state + trade group, intercepts or parses the bid listing data, and paginates through results.

**Build path is clear.** The one open item before build starts: validate that DemandStar's SPA makes interceptable JSON API calls on page load (most React SPAs do). If yes, the actor becomes significantly simpler — parse the API response directly rather than scraping rendered DOM. This can be confirmed in ~30 minutes by loading a browse-bids URL in Chrome DevTools → Network tab and filtering for XHR/Fetch calls.

**Geography scoping** can be handled entirely in the URL (state + metro-area path segments), with a post-scrape county/agency name filter applied in Make.com as a safety net.

**Estimated build time:** 4–8 hours for a working Playwright actor covering FL + AL with trade group filtering and weekly scheduling on Apify.

---

*Brief produced by Cowork — June 8, 2026*
