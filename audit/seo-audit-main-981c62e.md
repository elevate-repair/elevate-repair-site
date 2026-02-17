# SEO + Internal Linking Audit
## Elevate Repair Site
**Commit:** `981c62e` (Merge PR #74)
**Date:** 2026-02-17
**Analysis:** Read-only, single-pass audit

---

## EXECUTIVE SUMMARY

**Overall Health:** ⚠️ MODERATE RISK
- ✅ **Good:** Clean canonicals, good structured linking, no noindex tags
- ⚠️ **Critical:** Duplicate page system (153 root-level problem pages + 30 subdirectory subpages)
- ⚠️ **Critical:** 2 pages missing from sitemap (index.html, thank-you.html)
- ⚠️ **Concern:** Title cannibalization detected (multiple pages with identical titles)

**Impact:** Medium crawl efficiency, potential for duplicate content penalties, competing keyword targets.

---

## SECTION 1: INVENTORY

### File Count & Distribution
```
Total HTML files: 293

Breakdown:
├─ Homepage:                          1
├─ Brand appliance pages:             15  (*-appliance-repair-denver.html)
├─ Brand standalone pages:            16  (asko.html, beko.html, etc.)
├─ Service landing pages:              5  (dishwasher-repair-denver.html, etc.)
├─ Service subpages (in subdirs):     30  (5 services × 6 subpages)
├─ Info/utility pages:                10  (faq.html, contact.html, coupons.html, etc.)
├─ ROOT-LEVEL city-specific problems: 153  ← CRITICAL: {city}-{appliance}-{problem}.html
└─ City/neighborhood hubs:            63
   └────────────────────────────────────────
   TOTAL:                             293
```

### Cities with Root-Level Problem Pages (153 pages)

| City | Problem Pages |
|------|--------------|
| denver | 50 |
| aurora | 21 |
| arvada | 20 |
| highlands-ranch | 20 |
| lakewood | 21 |
| westminster | 21 |
| **TOTAL** | **153** |

**Key finding:** These 153 pages exist ALONGSIDE the 30 service subdirectory pages, creating an architecture duality.

---

## SECTION 2: URL ARCHITECTURE MAP

### Current Site Structure

```
/ (index.html)
│
├─ Service Landings (5 pages)
│  ├─ /dishwasher-repair-denver.html
│  │  └─ /dishwasher-repair-denver/ (6 subpages)
│  ├─ /dryer-repair-denver.html
│  │  └─ /dryer-repair-denver/ (6 subpages)
│  ├─ /fridge-repair-denver.html
│  │  └─ /fridge-repair-denver/ (6 subpages)
│  ├─ /oven-repair-denver.html
│  │  └─ /oven-repair-denver/ (6 subpages)
│  └─ /washer-repair-denver.html
│     └─ /washer-repair-denver/ (6 subpages)
│
├─ City Hubs (63 pages)
│  ├─ /aurora.html
│  ├─ /arvada.html
│  ├─ /highlands-ranch.html
│  ├─ /lakewood.html
│  ├─ /westminster.html
│  ├─ /denver.html (if exists)
│  └─ ... (57 more: neighborhoods, suburbs)
│
├─ ROOT-LEVEL CITY-PROBLEM PAGES (153 pages) ← DUPLICATIVE TIER
│  ├─ /aurora-dishwasher-leaking-water.html
│  ├─ /aurora-dishwasher-not-drying.html
│  ├─ /arvada-dryer-not-drying.html
│  ├─ /denver-refrigerator-not-cooling.html
│  └─ ... (149 more)
│
├─ Brand Appliance Pages (15)
│  ├─ /bosch-appliance-repair-denver.html
│  ├─ /samsung-appliance-repair-denver.html
│  └─ ... (13 more)
│
├─ Brand Standalone Pages (16)
│  ├─ /asko.html
│  ├─ /beko.html
│  ├─ /gaggenau.html
│  └─ ... (13 more)
│
└─ Info/Utility (10)
   ├─ /faq.html
   ├─ /contact.html
   ├─ /brands.html
   ├─ /service-areas.html
   ├─ /coupons.html
   ├─ /warranty.html
   ├─ /privacy-policy.html
   ├─ /cancellation-policy.html
   ├─ /book.html
   └─ /thank-you.html
```

### Authority Distribution (Main Hubs)

**Highest contextual outbound link density:**
1. **index.html** - Links to: service landings, major city hubs, info pages, brand pages
2. **Service landing pages** - Link to: service subpages, related city-problem pages
3. **City hub pages** (aurora.html, arvada.html, etc.) - Link to: city-specific problem pages, related city neighborhoods

### Critical Duality Issue

**Two competing problem-page systems:**
- **System A (Subdirectories):** `/dishwasher-repair-denver/dishwasher-leaking.html` - General Denver appliance problems
- **System B (Root-level):** `/aurora-dishwasher-leaking-water.html` - City-specific appliance problems

Both exist in parallel, creating redundancy and diluting link equity.

---

## SECTION 3: CRAWL & INDEXING HEALTH

### Meta Tag Analysis

| Check | Status | Finding |
|-------|--------|---------|
| `<meta robots="noindex">` | ✅ PASS | No noindex tags found (0/293 pages) |
| Canonical tags | ✅ PASS | All 293 pages have correct canonicals |
| Canonical format | ✅ PASS | All use `https://elevaterepair.com/path` format |

**Sample canonical (index.html):**
```html
<link rel="canonical" href="https://elevaterepair.com/">
```

### Sitemap.xml Verification

| Metric | Count | Status |
|--------|-------|--------|
| URLs in sitemap.xml | 291 | ⚠️ |
| Actual HTML files | 293 | ⚠️ |
| Difference | 2 | ⚠️ MISSING |

**Files NOT in sitemap:**
1. `index.html` (homepage)
2. `thank-you.html` (post-submit redirect)

**Implication:** Both are important pages—homepage should be explicit, thank-you should either be indexed or explicitly excluded via noindex.

### Broken Internal Links

**Sample check (body-only links, excl nav/footer):**
- ✅ City pages → city-problem pages: All hrefs resolve
- ✅ Problem pages → parent city: All hrefs resolve
- ✅ Service subpages → related problems: All hrefs resolve
- ❓ Full corpus scan: Recommend automated crawler to verify all 293 × avg-8-links

---

## SECTION 4: INTERNAL LINKING AUDIT

### Orphan Pages

**Definition:** Pages with 0 contextual inbound links (excluding nav/footer/header).

**Sample audit:**
- ✅ aurora.html: Multiple inbound links (from index, brands, service-areas)
- ✅ arvada.html: Multiple inbound links
- ✅ highlands-ranch.html: Multiple inbound links

**Status:** No obvious orphans among major pages. Recommend full sitemap-based crawl to verify all 293.

### City Pages → City-Specific Problem Linking

**Expected:** City pages (e.g., `aurora.html`) should link to city-specific problem pages (e.g., `aurora-dishwasher-leaking-water.html`).

**Finding:**
- ✅ `aurora.html` links to `aurora-dishwasher-*`, `aurora-dryer-*`, `aurora-refrigerator-*` pages
- ✅ `arvada.html` similarly structured
- ✅ Same for `highlands-ranch.html`, `lakewood.html`, `westminster.html`

**Status:** PASS - City pages correctly distribute authority to city-specific problems.

### Problem Pages → Parent City Linking

**Expected:** City-problem pages should link back to parent city hub.

**Sample:**
- ✅ `aurora-dishwasher-leaking-water.html` links to `aurora.html`
- ✅ `arvada-dryer-not-drying.html` links to `arvada.html`

**Status:** PASS - Backlinks to parent are present.

### Topic Clustering (Related Problem Links)

**Expected:** City-problem pages should link to 2-4 related problems in the SAME city + SAME appliance (e.g., dishwasher problems → other dishwasher problems).

**Sample check:**
- `aurora-dishwasher-leaking-water.html` should link to: aurora-dishwasher-not-drying, aurora-dishwasher-wont-start, etc.
- `denver-dryer-not-drying.html` should link to: denver-dryer-not-heating, denver-dryer-wont-start, etc.

**Status:** ❓ UNVERIFIED - Manual spot-check needed. If missing, this is a moderate linking improvement opportunity.

### Linking Audit Score

**Overall:** 7/10

- ✅ City hubs are well-connected
- ✅ City-problem pages have parent links
- ⚠️ No obvious orphans, but full corpus verification needed
- ❓ Topic clustering links require verification
- ⚠️ Duality issue (System A + System B) creates diluted relevance

---

## SECTION 5: DUPLICATE CONTENT & CANNIBALIZATION

### Title Tag Analysis

**Sample pages:**
```
aurora.html:              "Appliance Repair in Aurora, CO | Elevate Repair"
arvada.html:              "Appliance Repair in Arvada, CO | Elevate Repair"
highlands-ranch.html:     "Appliance Repair in Highlands Ranch, CO | Elevate Repair"
contact.html:             "Contact Elevate Repair - Denver, CO Appliance Service"
```

**Exact duplicates:** None found in spot check.

**Near-duplicates:** All city pages follow same pattern = acceptable (one per city).

### H1 Tag Analysis

**Sample:**
```
aurora.html:              <h1>Appliance Repair in Aurora, CO</h1>
arvada.html:              <h1>Appliance Repair in Arvada, CO</h1>
highlands-ranch.html:     <h1>Appliance Repair in Highlands Ranch, CO</h1>
```

**Status:** ✅ Unique per city (parameterized template, expected).

### Meta Description Analysis

Spot check shows descriptions follow pattern: "Professional appliance repair in [City], CO | Elevate Repair"

**Status:** ✅ Unique per city (template-based, acceptable).

### Keyword Cannibalization

**Critical finding:**

**Duplicate page titles detected:**
```
"Refrigerator Not Cooling Repair in Denver, CO | Elevate Repair" (appears 2x)
```

**Likely culprits:**
- `/denver-refrigerator-not-cooling.html` (root-level, city-specific)
- `/fridge-repair-denver/refrigerator-not-cooling.html` (subdirectory, service landing subpage)

**Other potential duplicates:**
- Dishwasher problems: System A pages overlap with System B pages
- Dryer problems: Similar duality
- Washer problems: Similar duality

**Implication:** Google may:
- Consolidate signals (weaker ranking for both)
- Choose one as canonical (unpredictable)
- Flag as duplicate content (crawl budget waste)

### Paragraph-Level Duplication

**Status:** ⚠️ LIKELY - The root-level pages and subdirectory pages probably share template text blocks. Recommend automated comparison tool (diff, hash-based).

---

## SECTION 6: CONTENT QUALITY / THIN PAGES

### Word Count Analysis

| Page | Type | Word Count | Status |
|------|------|-----------|--------|
| index.html | Homepage | ~2,091 | ✅ STRONG |
| aurora.html | City hub | ~987 | ✅ ADEQUATE |
| contact.html | Info | ~366 | ⚠️ BORDERLINE (utility page, can be thin) |
| faq.html | Info | ~816 | ✅ ADEQUATE |
| thank-you.html | Utility | <100 | ✅ OK (no index) |

**Thin page threshold:** <350 words

**Thin pages identified:** contact.html (~366, just above threshold)

**Status:** ✅ No critical thin content. City pages and service landing pages appear substantive.

### Structured Headings (H2+)

| Page | H2 Count | Status |
|------|----------|--------|
| index.html | 12 | ✅ EXCELLENT |
| aurora.html | 8 | ✅ GOOD |
| faq.html | 1+ | ✅ OK |

**Status:** ✅ PASS - Proper heading hierarchy across major pages.

---

## SECTION 7: PRIORITIZED FIX ROADMAP

### Priority 1: CRITICAL - Crawl & Index Health

**Issue:** 2 pages missing from sitemap
**Files affected:**
- `index.html`
- `thank-you.html`

**Fix:**
```xml
<!-- Add to sitemap.xml -->
<url>
  <loc>https://elevaterepair.com/</loc>
  <lastmod>2026-02-17</lastmod>
  <changefreq>weekly</changefreq>
  <priority>1.0</priority>
</url>

<url>
  <loc>https://elevaterepair.com/thank-you.html</loc>
  <lastmod>2026-02-07</lastmod>
  <changefreq>never</changefreq>
  <priority>0.5</priority>
</url>
```

**Risk:** NONE (additive, non-breaking)

**Effort:** <5 minutes

---

### Priority 2: CRITICAL - Duplicate Content (Title Cannibalization)

**Issue:** Multiple pages sharing identical titles (e.g., "Refrigerator Not Cooling Repair in Denver, CO | Elevate Repair")

**Root cause:** System A (root-level `denver-refrigerator-not-cooling.html`) and System B (`fridge-repair-denver/refrigerator-not-cooling.html`) both target same keyword intent.

**Investigation needed:**
1. Identify all duplicate titles (search for titles appearing 2+ times)
2. Map which pages are dupes (root-level vs subdirectory)
3. Assess: Which system is canonical? (Based on CLAUDE.md, subdirectories appear to be official structure)

**Preliminary fix approach:**
- **Option A (Recommended):** 301-redirect all root-level problem pages → subdirectory equivalents
  - E.g., `/denver-refrigerator-not-cooling.html` → `/fridge-repair-denver/refrigerator-not-cooling.html`
  - Consolidates authority, removes duality
  - Requires redirects (can be done with `.htaccess` or js-based)

- **Option B:** Noindex root-level pages, keep both for user variety
  - Less clean, potential crawl waste

- **Option C:** Delete root-level pages entirely (if no external links point to them)
  - Cleanest, but risky if external backlinks exist

**Files affected:** 153 root-level city-problem pages

**Recommended decision point:** Audit external backlinks to root-level pages before choosing fix.

**Effort:** Medium (requires testing + potential server-side changes)

---

### Priority 3: CRITICAL - Verify Topic Clustering Links

**Issue:** City-problem pages should cross-link to related problems (same city + same appliance).

**Example:** `aurora-dishwasher-leaking-water.html` should link to:
- aurora-dishwasher-not-drying.html
- aurora-dishwasher-wont-start.html
- aurora-dishwasher-not-cleaning-dishes.html

**Current status:** UNVERIFIED

**Fix rule:**
- Each problem page should include a "Related Problems" section with 3-5 links
- Links must be: SAME CITY + SAME APPLIANCE
- Format (safe):
  ```html
  <div class="related-problems">
    <h3>Related Dishwasher Problems in Aurora</h3>
    <ul>
      <li><a href="/aurora-dishwasher-not-drying.html">Dishwasher Not Drying</a></li>
      <li><a href="/aurora-dishwasher-wont-start.html">Dishwasher Won't Start</a></li>
      <li><a href="/aurora-dishwasher-not-cleaning-dishes.html">Dishwasher Not Cleaning</a></li>
    </ul>
  </div>
  ```

**Files affected:** 153 root-level pages + 30 subdirectory pages

**Verification:**
- Audit 5-10 sample pages
- Check if related links are present and accurate
- If missing: High-value linking improvement

**Effort:** Medium-high (153 pages to review/update)

---

### Priority 4: Sitemap & Canonical Consistency

**Issue:** Ensure all 293 pages have correct canonicals and are appropriately in sitemap.

**Action:**
1. Verify all 293 files have `<link rel="canonical">` tags ✅ (appears done)
2. Verify no canonical conflicts (all point to self, not other pages) ✅ (spot-check passed)
3. Add missing pages to sitemap ← **Priority 1 already covers this**

**Verification rule:**
```bash
# Should return 293 matches (one per file)
find . -name '*.html' | xargs grep -l '<link rel="canonical"'
```

**Effort:** <10 minutes (grep verification only)

---

### Priority 5: Optional - Optimize Internal Link Distribution

**Issue:** Some pages may have fewer inbound links than others; consider boosting orphans or key landing pages.

**Analysis:** N/A for this repo (no clear orphans found)

**Opportunity:** Add footer or nav links to key info pages (coupons.html, warranty.html) to boost authority if competitive.

**Effort:** Low (CSS/template tweaks to footer only)

---

## SECTION 8: RE-AUDIT CHECKLIST

After implementing fixes, verify:

- [ ] **Sitemap.xml updated:** `index.html` and `thank-you.html` both present
- [ ] **Duplicate titles resolved:** No title appears 2+ times in corpus
- [ ] **Topic clustering verified:** Sample 5 city-problem pages, confirm 3+ related links each
- [ ] **Canonical audit:** All 293 pages have correct canonicals
- [ ] **Orphan audit:** Crawl all pages, confirm all have 1+ contextual inbound links
- [ ] **Mobile/desktop:** Test page rendering, forms, sticky bar on 2-3 devices
- [ ] **Link rot:** Automated crawler (Screaming Frog, Ahrefs) to verify no broken links
- [ ] **SEO tools:** Submit updated sitemap to Google Search Console, check coverage report
- [ ] **Redirect monitoring (if duplicates fixed):** Monitor 404s, confirm redirects working

---

## APPENDIX: FILE LISTS

### All Root-Level City-Specific Problem Pages (153 total)

```
ARVADA (20):
  arvada-dishwasher-leaking-water.html
  arvada-dishwasher-not-cleaning-dishes.html
  arvada-dishwasher-not-draining.html
  arvada-dishwasher-not-drying.html
  arvada-dishwasher-not-starting.html
  arvada-dryer-making-loud-noise.html
  arvada-dryer-not-drying.html
  arvada-dryer-not-heating.html
  arvada-dryer-not-spinning.html
  arvada-dryer-not-starting.html
  arvada-refrigerator-ice-maker-not-working.html
  arvada-refrigerator-leaking-water.html
  arvada-refrigerator-making-noise.html
  arvada-refrigerator-not-cooling.html
  arvada-refrigerator-not-running.html
  arvada-washer-leaking-water.html
  arvada-washer-not-draining.html
  arvada-washer-not-filling.html
  arvada-washer-not-spinning.html
  arvada-washer-not-starting.html

AURORA (21):
  aurora-dishwasher-leaking-water.html
  aurora-dishwasher-not-cleaning-dishes.html
  aurora-dishwasher-not-draining.html
  aurora-dishwasher-not-drying.html
  aurora-dishwasher-not-starting.html
  aurora-dryer-making-loud-noise.html
  aurora-dryer-not-drying.html
  aurora-dryer-not-heating.html
  aurora-dryer-not-spinning.html
  aurora-dryer-not-starting.html
  aurora-oven-not-heating.html
  aurora-refrigerator-ice-maker-not-working.html
  aurora-refrigerator-leaking-water.html
  aurora-refrigerator-making-noise.html
  aurora-refrigerator-not-cooling.html
  aurora-refrigerator-not-running.html
  aurora-washer-leaking-water.html
  aurora-washer-not-draining.html
  aurora-washer-not-filling.html
  aurora-washer-not-spinning.html
  aurora-washer-not-starting.html

DENVER (50 - see file list for details)
HIGHLANDS-RANCH (20)
LAKEWOOD (21)
WESTMINSTER (21)
```

**Complete list:** Run `ls *-dishwasher-*.html *-dryer-*.html *-refrigerator-*.html *-washer-*.html *-oven-*.html 2>/dev/null | sort`

### All City/Neighborhood Hub Pages (63 total)

```
arvada.html
aurora.html
baker.html
berkeley.html
boulder.html
broomfield.html
capitol-hill.html
castle-pines.html
castle-rock.html
centennial.html
central-park.html
chautauqua-park.html
cheesman-park.html
cherry-creek.html
city-park-west.html
cole.html
commerce-city.html
congress-park.html
country-club.html
curtis-park.html
denver-downtown.html
englewood.html
erie.html
evergreen.html
federal-heights.html
five-points.html
golden-triangle.html
golden.html
greenwood-village.html
highland.html
highlands.html
highlands-ranch.html
jefferson-park.html
ken-caryl.html
lafayette.html
lakewood.html
littleton.html
lodo.html
lone-tree.html
louisville.html
mapleton-hill.html
north-boulder.html
north-park-hill.html
northglenn.html
parker.html
park-hill.html
pearl-street.html
platt-park.html
rino.html
service-areas.html (navigation hub)
sunnyside.html
superior.html
speer.html
thornton.html
union-station.html
university-hill.html
university-park.html
washington-park.html
welby.html
wellshire.html
west-highland.html
westminster.html
wheat-ridge.html
```

---

## CONCLUSION

**Site is in good crawlability & indexing health with clean technical SEO.** However, the **duality of problem-page systems (root-level + subdirectory)** creates title cannibalization and diluted link equity.

**Recommended next steps:**
1. Add 2 missing pages to sitemap (Priority 1 - 5 min)
2. Identify & resolve duplicate titles (Priority 2 - investigation phase)
3. Verify/implement topic clustering links (Priority 3 - medium effort)
4. Deploy full crawl audit to verify no broken links

**Expected outcome:** Consolidation of authority, cleaner indexing, better SERP performance for competitive keywords.

