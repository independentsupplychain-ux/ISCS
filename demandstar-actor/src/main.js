/**
 * DemandStar Gulf Coast Bid Scraper — v2
 * Project: Contractor Bid Prep / PublicBidPrep Co. (ISCS)
 *
 * Strategy:
 *   1. Log in to DemandStar with stored credentials (DEMANDSTAR_EMAIL / DEMANDSTAR_PASSWORD).
 *   2. Navigate to the supplier bids page to capture the Bearer auth token from outgoing XHR.
 *   3. POST to api.demandstar.com/contents/agency/search with state + active bid filters.
 *   4. Filter results to Gulf Coast agencies; push to Apify dataset.
 *
 * Output schema (matches Tier1-SMS-Flow-Spec.md — do NOT rename fields):
 *   opportunity_id, opportunity_title, agency_name, due_date, estimated_value, portal_link
 */

import { Actor } from 'apify';
import { chromium } from 'playwright';
import { log } from 'crawlee';

await Actor.init();

// ── Input ─────────────────────────────────────────────────────────────────────

const input = (await Actor.getInput()) ?? {};
const email = input.email ?? process.env.DEMANDSTAR_EMAIL;
const password = input.password ?? process.env.DEMANDSTAR_PASSWORD;
const disableGeographyFilter = input.disableGeographyFilter ?? false;

if (!email || !password) {
    throw new Error(
        'DEMANDSTAR_EMAIL and DEMANDSTAR_PASSWORD are required. ' +
        'Set them as Actor input fields or environment variables.'
    );
}

// ── Config ────────────────────────────────────────────────────────────────────

const APP_BASE = 'https://www.demandstar.com';
const API_BASE = 'https://api.demandstar.com';
const BIDS_URL = `${APP_BASE}/app/suppliers/bids`;

// Geography filter — off by default (return all FL + AL bids statewide)
// Set disableGeographyFilter=true in input to restrict to Gulf Coast corridor keywords only
const GULF_COAST_KEYWORDS = [
    'escambia', 'santa rosa', 'okaloosa', 'walton', 'bay county',
    'gulf county', 'franklin', 'leon county', 'pensacola', 'tallahassee',
    'panama city', 'crestview', 'niceville', 'fort walton', 'destin',
    'milton', 'mobile', 'baldwin', 'daphne', 'fairhope', 'foley',
    'gulf shores', 'orange beach',
];

// Maps Gulf Coast keyword → readable region label (for county_region field)
const GULF_COAST_REGION_MAP = [
    ['escambia county', 'Escambia County, FL'],
    ['escambia', 'Escambia County, FL'],
    ['santa rosa', 'Santa Rosa County, FL'],
    ['okaloosa', 'Okaloosa County, FL'],
    ['walton', 'Walton County, FL'],
    ['bay county', 'Bay County, FL'],
    ['gulf county', 'Gulf County, FL'],
    ['franklin', 'Franklin County, FL'],
    ['leon county', 'Leon County, FL'],
    ['leon', 'Leon County, FL'],
    ['pensacola', 'Pensacola, FL'],
    ['tallahassee', 'Tallahassee, FL'],
    ['panama city', 'Panama City, FL'],
    ['crestview', 'Crestview, FL'],
    ['niceville', 'Niceville, FL'],
    ['fort walton', 'Fort Walton Beach, FL'],
    ['destin', 'Destin, FL'],
    ['milton', 'Milton, FL'],
    ['mobile county', 'Mobile County, AL'],
    ['mobile', 'Mobile County, AL'],
    ['baldwin', 'Baldwin County, AL'],
    ['daphne', 'Daphne, AL'],
    ['fairhope', 'Fairhope, AL'],
    ['foley', 'Foley, AL'],
    ['gulf shores', 'Gulf Shores, AL'],
    ['orange beach', 'Orange Beach, AL'],
];

// Trade category keyword classifier — coarse mapping from bid title keywords.
// These are best-effort defaults; Make.com can refine based on full bid details.
// ⚠️ Assumption flag: title-based classification will miss bids with vague titles
// (e.g., "Annual Maintenance Contract") — David should review actual output and
// add/adjust keywords based on real weekly data.
const TRADE_CATEGORY_KEYWORDS = [
    ['Roofing', ['roof', 'roofing', 'shingle', 'membrane roofing', 'metal roof', 'gutter']],
    ['HVAC', ['hvac', 'heating', 'cooling', 'ventilation', 'air condition', 'chiller', 'boiler', 'mechanical system', 'ductwork']],
    ['Electrical', ['electric', 'lighting', 'wiring', 'switchgear', 'generator', 'solar panel', 'transformer', 'conduit']],
    ['Plumbing', ['plumb', 'piping', 'pipe install', 'sewer', 'water main', 'drainage system', 'waterline']],
    ['General Contracting', ['construction', 'renovation', 'rehabilitation', 'remodel', 'general contract', 'building repair', 'facility improvement', 'infrastructure', 'bridge', 'sidewalk', 'parking lot', 'pavement', 'playground', 'park improvement']],
];

function passesGeoFilter(agencyName) {
    if (!disableGeographyFilter) return true; // default: all FL/AL bids pass
    if (!agencyName) return false;
    const lower = agencyName.toLowerCase();
    return GULF_COAST_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Derive county/region label from agency name. Returns '' if no match. */
function deriveCountyRegion(agencyName) {
    if (!agencyName) return '';
    const lower = agencyName.toLowerCase();
    for (const [kw, label] of GULF_COAST_REGION_MAP) {
        if (lower.includes(kw)) return label;
    }
    return '';
}

/** Derive trade categories from bid title. Returns [] if no keywords match. */
function deriveTradeCategoryFromTitle(title) {
    if (!title) return [];
    const lower = title.toLowerCase();
    const matches = [];
    for (const [trade, kws] of TRADE_CATEGORY_KEYWORDS) {
        if (kws.some((kw) => lower.includes(kw))) matches.push(trade);
    }
    return matches;
}

const RUN_DATE = new Date().toISOString().split('T')[0]; // e.g. "2026-06-14"

// ── Browser setup ─────────────────────────────────────────────────────────────

log.info('Launching browser...');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
});
const page = await context.newPage();

// ── Capture auth token from outgoing API requests ─────────────────────────────

let authHeader = null;
await context.route(`${API_BASE}/**`, async (route) => {
    const headers = route.request().headers();
    if (headers['authorization'] && !authHeader) {
        authHeader = headers['authorization'];
        log.info('Auth token captured from outgoing request.');
    }
    await route.continue();
});

// ── Login ─────────────────────────────────────────────────────────────────────

// Helper to save a debug screenshot
async function debugShot(label) {
    const buf = await page.screenshot({ fullPage: false });
    await Actor.setValue(`DEBUG-screenshot-${label}`, buf, { contentType: 'image/png' });
    log.info(`Screenshot saved: DEBUG-screenshot-${label} | URL: ${page.url()}`);
}

log.info('Navigating to DemandStar homepage...');
await page.goto(APP_BASE, { waitUntil: 'networkidle', timeout: 45000 });
await debugShot('01-homepage');
log.info(`Homepage URL: ${page.url()}`);

// Try to find a Sign In link on the homepage and click it
const signInLink = await page.$('a[href*="login"], button:has-text("Sign In"), a:has-text("Sign In"), a:has-text("Log in"), button:has-text("Log in")');
if (signInLink) {
    log.info('Clicking Sign In link...');
    await signInLink.click();
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await debugShot('02-after-signin-click');
} else {
    // Navigate directly to login
    log.info('No Sign In link found on homepage — navigating directly to /app/login...');
    await page.goto(`${APP_BASE}/app/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await debugShot('02-login-page');
}

log.info(`Login page URL: ${page.url()}`);

// Login form uses "Username" label — wait for username or email input
const USERNAME_SELECTOR = 'input[name="username"], input[id*="username" i], input[placeholder*="username" i], input[type="email"], input[name="email"], input[id*="email" i]';
await page.waitForSelector(USERNAME_SELECTOR, { timeout: 20000 });
await debugShot('03-username-field-visible');

log.info('Filling username/email...');
await page.fill(USERNAME_SELECTOR, email);

// Password should be on the same page
await page.waitForSelector('input[type="password"]', { timeout: 10000 });
await page.fill('input[type="password"]', password);

// Click Login button
await page.click('button:has-text("Login"), button[type="submit"], input[type="submit"]');

await debugShot('05-after-submit');

// Wait for redirect away from login domain
log.info('Waiting for post-login redirect...');
await page.waitForURL(
    (url) => url.toString().includes('demandstar.com') && !url.toString().includes('/login'),
    { timeout: 45000 }
);
await debugShot('06-post-login');
log.info(`Login successful. Current URL: ${page.url()}`);

// ── Intercept SPA calls to capture search URL, headers, and state IDs ─────────

let searchApiUrl = null;
let searchApiHeaders = null;
let initialSearchResult = null;
const stateIdMap = {};  // { "FL": "9", "AL": "1", ... }

await context.route(/api\.demandstar\.com.*\/search/, async (route) => {
    const req = route.request();
    if (!searchApiUrl) {
        searchApiUrl = req.url();
        searchApiHeaders = { ...req.headers() };
        log.info(`Captured search API URL: ${searchApiUrl}`);
    }
    const resp = await route.fetch();
    if (!initialSearchResult) {
        try { initialSearchResult = await resp.json(); } catch {}
    }
    await route.fulfill({ response: resp });
});

// Intercept getLocations to capture state IDs (needed for server-side state filtering)
await context.route(/api\.demandstar\.com.*getLocations/, async (route) => {
    const resp = await route.fetch();
    try {
        const data = await resp.json();
        // Save raw sample to inspect field names
        const list = Array.isArray(data) ? data : data?.result ?? data?.data ?? [];
        if (list.length > 0) {
            await Actor.setValue('DEBUG-getlocations-sample', list.slice(0, 5));
        }
        for (const s of list) {
            // getLocations is county-level: stateAbbreviation + stateId
            const code = s.stateAbbreviation ?? s.code ?? s.abbreviation ?? s.stateCode;
            const id = s.stateId ?? s.id ?? s.geoStateId;
            if (code && id != null) stateIdMap[String(code).toUpperCase()] = String(id);
        }
        log.info(`getLocations: ${list.length} entries — FL: ${stateIdMap['FL'] ?? '?'}, AL: ${stateIdMap['AL'] ?? '?'}`);
    } catch (e) {
        log.warning(`getLocations parse error: ${e.message}`);
    }
    await route.fulfill({ response: resp });
});

log.info('Loading bids page to capture SPA calls...');
await page.goto(BIDS_URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3000);

log.info(`Search URL: ${searchApiUrl}`);
log.info(`Initial search total: ${initialSearchResult?.total ?? 'n/a'}`);
log.info(`State IDs — FL: ${stateIdMap['FL'] ?? 'unknown'}, AL: ${stateIdMap['AL'] ?? 'unknown'}`);

// ── Search for active bids ────────────────────────────────────────────────────

const allOpportunities = [];
const seenIds = new Set();

async function searchBids(payload) {
    const url = searchApiUrl ?? `${API_BASE}/contents/content/v1/bids/search`;
    const headers = searchApiHeaders
        ? { ...searchApiHeaders, 'content-type': 'application/json' }
        : { 'Content-Type': 'application/json', Accept: 'application/json' };

    const resp = await context.request.post(url, { headers, data: payload });
    if (!resp.ok()) {
        const body = await resp.text();
        return { error: resp.status(), body };
    }
    return resp.json();
}

// Query per state (FL + AL) to avoid national 200-bid cap
// Fall back to a single broad query if state IDs weren't captured
log.info('Searching active bids by state...');

const BASE_PAYLOAD = {
    bidStatus: 'AC',
    includeExternalBids: 'true',
    showBids: 'externalBids',
    sortBy: 'broadCastDate',
    sortOrder: 'DESC',
};

const stateTargets = [];
if (stateIdMap['FL']) stateTargets.push({ label: 'FL', stateId: stateIdMap['FL'] });
if (stateIdMap['AL']) stateTargets.push({ label: 'AL', stateId: stateIdMap['AL'] });
if (stateTargets.length === 0) {
    log.warning('State IDs not captured — falling back to single broad search (state filter by bid record field)');
    stateTargets.push({ label: 'ALL', stateId: null });
}

// The API returns max 200 results per call and ignores skip/page params.
// Work around by making two calls per state — newest first (DESC) + oldest first (ASC)
// and deduplicating. Covers ~90%+ of active bids without needing real pagination.
const SORT_PASSES = ['DESC', 'ASC'];

let savedRaw = false;
for (const target of stateTargets) {
    for (const sortOrder of SORT_PASSES) {
        const payload = { ...BASE_PAYLOAD, sortOrder };
        if (target.stateId) payload.states = target.stateId;

        log.info(`  ${target.label} (sort: ${sortOrder})...`);
        const result = await searchBids(payload);

        if (result?.error) {
            log.error(`Search failed for ${target.label} ${sortOrder}: HTTP ${result.error}`);
            await Actor.setValue(`DEBUG-search-error-${target.label}-${sortOrder}`, result.body ?? '');
            continue;
        }

        const bids = result?.result ?? result?.results ?? (Array.isArray(result) ? result : []);
        const apiTotal = result?.total ?? 0;
        log.info(`  ${target.label} ${sortOrder}: ${bids.length} bids (total: ${apiTotal})`);

        if (!savedRaw) {
            await Actor.setValue('DEBUG-search-raw', result);
            savedRaw = true;
        }

        for (const bid of bids) {
            const bidId = String(bid.bidId ?? bid.id ?? '').trim();
            if (!bidId || seenIds.has(bidId)) continue;

            if (!target.stateId) {
                const stateCode = (bid.state ?? bid.stateCode ?? '').toUpperCase();
                if (!['FL', 'AL'].includes(stateCode)) continue;
            }

            const agencyName = (bid.agency ?? bid.agencyName ?? '').trim();
            if (!passesGeoFilter(agencyName)) continue;

            seenIds.add(bidId);
            const title = (bid.bidName ?? bid.title ?? '').trim();
            allOpportunities.push({
                opportunity_id: bidId,
                opportunity_title: title,
                agency_name: agencyName,
                due_date: bid.dueDate ?? null,
                estimated_value: bid.estimatedValue ?? bid.estimatedAmount ?? null,
                portal_link: `${APP_BASE}/app/suppliers/bids/${bidId}/details`,
                trade_category: deriveTradeCategoryFromTitle(title),
                county_region: deriveCountyRegion(agencyName),
                source: 'DemandStar',
                first_seen: RUN_DATE,
            });
        }

        log.info(`  Running total: ${allOpportunities.length} opportunities`);

        // If total fits within one call, skip the second sort pass
        if (apiTotal <= 200) break;
    }
}

// ── Output ────────────────────────────────────────────────────────────────────

log.info(`\nTotal Gulf Coast opportunities: ${allOpportunities.length}`);

if (allOpportunities.length > 0) {
    log.info('Sample record:');
    log.info(JSON.stringify(allOpportunities[0], null, 2));
} else {
    log.warning(
        'Zero records produced. Check DEBUG-search-raw-FL / DEBUG-search-raw-AL key-value ' +
        'store entries for the raw API response. If they show bids but none matched Gulf Coast ' +
        'agencies, set disableGeographyFilter=true in Actor input to see all FL/AL results.'
    );
}

await Actor.pushData(allOpportunities);

await browser.close();
await Actor.exit();
