# CLAUDE.md — Elevate Repair Site

## Core Rules

- This repository is the single source of truth.
- Do not create artifacts or side files.
- Follow existing file structure.
- One simple form (Name + Phone) per page — only on pages that need one.
- No duplicate forms on any single page.
- Shared header and footer across all pages (copy exactly from an existing page).
- All CSS lives in `/styles.css` (root). Do not create additional stylesheets.
- `/assets/css/style.css` exists but is archived/unused — do not reference it.
- Each page must be a separate HTML file.
- All JavaScript is inline within `<script>` tags — no external JS files.

---

## Codebase Structure

```
/
├── index.html                        # Homepage (most feature-rich page)
├── styles.css                        # PRIMARY stylesheet (all pages link here)
├── sitemap.xml                       # XML sitemap
├── robots.txt                        # Robots directives
├── site.webmanifest                  # PWA manifest
├── CLAUDE.md                         # AI assistant instructions (this file)
├── README.md                         # Minimal readme
├── thank-you.html                    # Post-form-submit redirect
├── book.html                         # Standalone booking page (has form)
├── favicon.ico / favicon-*.png       # Favicons
├── android-chrome-*.png              # PWA icons
├── apple-touch-icon.png              # iOS icon
│
├── assets/
│   ├── css/
│   │   └── style.css                 # ARCHIVED — not used by any HTML page
│   └── images/
│       ├── appliances/               # Appliance-type images (JPG)
│       ├── brands/                   # Brand logos (placeholder, gitkeep only)
│       ├── cities banner/            # City hero images (desktop + mobile WebP pairs)
│       ├── hero/                     # Site hero image + OG image
│       └── problems/                 # Problem page images (JPG/WebP)
│
├── tools/                            # Dev/generation scripts (NOT deployed)
│   ├── generate-problem-pages.mjs
│   ├── generate_mass_seo_plan.py
│   ├── generate_seo_pages.py
│   ├── pages-batch.json
│   ├── problem-page-template.html
│   ├── template_city_base.html
│   └── prompt_templates/
│       └── page_prompt.txt
│
├── [brand]-appliance-repair-denver.html   # Standard brand pages (15)
├── [brand].html                           # Short-name brand pages (16)
├── [city/neighborhood].html               # City & neighborhood pages (63)
├── [city]-[appliance]-[problem].html      # City-specific problem pages (103)
├── denver-[appliance]-[problem].html      # Denver-specific problem pages (40)
├── denver-[brand]-[appliance]-[problem].html  # Brand+city problem pages (10)
├── [appliance]-repair-denver.html         # Service landing pages (5)
│
├── dishwasher-repair-denver/         # Problem subpages (6)
├── dryer-repair-denver/              # Problem subpages (6)
├── fridge-repair-denver/             # Problem subpages (6)
├── oven-repair-denver/               # Problem subpages (6)
└── washer-repair-denver/             # Problem subpages (6)
│
├── brands.html                       # Brand directory
├── service-areas.html                # Service area directory
├── contact.html                      # Contact page
├── faq.html                          # FAQ page
├── coupons.html                      # Coupons/promotions
├── warranty.html                     # Warranty info
├── cancellation-policy.html          # Cancellation policy
└── privacy-policy.html               # Privacy policy
```

### Page Types (~295 HTML files total)

| Type | Example | Has Form? |
|------|---------|-----------|
| Homepage | `index.html` | Yes |
| Standard brand page | `bosch-appliance-repair-denver.html` | No |
| Short brand page | `asko.html`, `wolf.html` | No |
| City/neighborhood page | `aurora.html`, `capitol-hill.html` | Yes |
| City+appliance+problem page | `aurora-dishwasher-not-starting.html` | Yes |
| Denver+appliance+problem page | `denver-dishwasher-not-starting.html` | Yes |
| Brand+city+problem page | `denver-bosch-dryer-not-starting.html` | Yes (embedded form) |
| Service landing page | `dishwasher-repair-denver.html` | No |
| Problem subpage | `dishwasher-repair-denver/dishwasher-wont-start.html` | No (informational/diagnostic) |
| Info page | `faq.html`, `warranty.html`, `contact.html` | Varies |
| Book page | `book.html` | Yes |
| Thank-you page | `thank-you.html` | No |

### Brand Pages

**Standard naming** (`[brand]-appliance-repair-denver.html`, 15 pages):
amana, bosch, electrolux, frigidaire, ge, kenmore, kitchenaid, lg, maytag, miele, panasonic, samsung, sub-zero, viking, whirlpool

**Short naming** (`[brand].html`, 16 pages):
asko, beko, bertazzoni, bluestar, dacor, fisher-paykel, gaggenau, haier, hisense, hotpoint, insignia, jenn-air, magic-chef, speed-queen, thermador, wolf

### Denver Brand+City+Problem Pages (10 pages)

`denver-[brand]-[appliance]-[problem].html` — all have embedded booking forms:
- denver-bosch-dryer-not-starting.html
- denver-bosch-refrigerator-leaking-water.html
- denver-lg-dryer-not-heating.html
- denver-miele-dryer-not-heating.html
- denver-miele-refrigerator-ice-maker-not-working.html
- denver-samsung-dryer-not-heating.html
- denver-sub-zero-refrigerator-not-cooling.html
- denver-thermador-refrigerator-not-cooling.html
- denver-viking-refrigerator-not-cooling.html
- denver-whirlpool-dryer-not-spinning.html

### City/Neighborhood Pages (63 standalone pages)

City problem pages exist for: arvada (20), aurora (21), highlands-ranch (20), lakewood (21), westminster (21)
- The extra page each for aurora, lakewood, and westminster is `[city]-oven-not-heating.html`
- Arvada and highlands-ranch cover: dishwasher (5) + dryer (5) + refrigerator (5) + washer (5) = 20
- Aurora, lakewood, westminster cover the same plus oven-not-heating = 21

Denver plain problem pages: 40 (covering dishwasher, dryer, oven, refrigerator, washer combos)
Denver brand+city problem pages: 10 (bosch×2, lg, miele×2, samsung, sub-zero, thermador, viking, whirlpool)

### Problem Subpages (30 total, 6 per service directory)

These are informational/diagnostic pages — no inline booking form. CTAs link to `/book.html`.

| Directory | Subpages |
|-----------|---------|
| `dishwasher-repair-denver/` | dishwasher-leaking, dishwasher-making-noise, dishwasher-not-cleaning, dishwasher-not-drying, dishwasher-wont-drain, dishwasher-wont-start |
| `dryer-repair-denver/` | dryer-making-noise, dryer-not-heating, dryer-overheating, dryer-takes-too-long, dryer-wont-start, dryer-wont-tumble |
| `fridge-repair-denver/` | freezer-not-freezing, fridge-leaking-water, fridge-making-noise, ice-maker-not-making-ice, refrigerator-not-cooling, water-dispenser-not-working |
| `oven-repair-denver/` | burner-not-working, oven-door-wont-close, oven-not-heating, oven-temperature-inaccurate, oven-wont-turn-off, self-clean-not-working |
| `washer-repair-denver/` | washer-leaking-water, washer-not-filling, washer-shaking-vibrating, washer-wont-drain, washer-wont-spin, washer-wont-start |

---

## Shared Components

### Header (all pages)

Every page includes an identical `<header>` with:
- Logo link (`<a href="/" class="logo">Elevate Repair</a>`)
- Phone number link (`(720) 575-8432`)
- Burger menu button (mobile)
- `<nav class="nav-menu" id="navMenu">` with three nav groups: Services, Service Areas, More

### Footer (all pages)

Every page includes an identical `<footer class="site-footer">` with:
- Business name and address (1500 N Grant St, Denver, CO 80203)
- Link sections for services, areas, brands, info
- Copyright line: `2026 Elevate Repair`

### Sticky Bottom Bar (all pages, mobile only)

```html
<div class="sticky-bottom-bar">
    <a href="tel:7205758432" class="sticky-btn sticky-btn-call">Call Now</a>
    <a href="#book" class="sticky-btn sticky-btn-text">Book Online — Save $25</a>
</div>
```

Hidden at 769px+ via CSS.

### Body Class

Pages without a full-width hero background image use `<body class="no-hero-image">`. This triggers a centered hero layout via CSS. Most non-homepage pages use this class.

---

## Form Pattern

Forms appear on: homepage, city/neighborhood pages, city+appliance+problem pages, denver+appliance+problem pages, brand+city+problem pages, and `book.html`. Structure:

- **Fields:** Name (required), Phone (required), ZIP (optional), Message/Description (optional)
- **Action:** Google Apps Script endpoint (Google Sheets backend)
- **Target:** `hidden_iframe` (prevents page navigation on submit)
- **Hidden field:** `<input type="hidden" name="source" value="website-[location]">` for lead tracking
- **Post-submit:** JavaScript redirects to `/thank-you.html`

Do NOT add forms to standard/short brand pages, service landing pages, or problem subpages (in service directories).

---

## Inline JavaScript (no external JS files)

Script blocks used across pages:

1. **Google Analytics / Ads** — all pages. Tag ID: `AW-17878510208`
2. **Burger menu toggle** — all pages. IIFE toggling `.nav-open` class
3. **Form submit handler** — only pages with a form. Disables button, shows "Sending...", listens for iframe load, redirects to `/thank-you.html`
4. **FAQ accordion** — homepage only. Toggles `.open` class on `.faq-item`
5. **Gallery carousel** — homepage only. Arrow-button scrolling of `.gallery-track`

---

## CSS Architecture (`/styles.css`)

Single file, exactly 1,700 lines, mobile-first with `@media (min-width: 769px)` and `@media (max-width: 768px)` breakpoints.

### Key sections (approximate line ranges):
- Reset & base typography (1–30)
- Header (31–67)
- Burger menu (68–124)
- Hero section (125–218)
- Sub-page hero — compact, no image (219–237)
- Buttons: `.btn-primary` (red `#ef4444`), `.btn-secondary`, `.btn-outline` (238–280)
- Sections & backgrounds: `.section-alt`, `.section-blue` (281–316)
- Mid-page CTA band (317–333)
- Services grid (334–402)
- Service detail blocks (403–424)
- Benefits list (425–463)
- Cost table (464–514)
- Service areas / city links (515–552)
- Area cards with images (553–626)
- Coupon grid — homepage compact (627–639)
- Process steps (640–677)
- FAQ accordion (678–729)
- Problems accordion (730–805) — `details`/`summary` native HTML, no JS
- Booking form (806–849)
- Reviews grid & marquee (850–936)
- Social strip (937–985)
- Final CTA band (986–1007)
- Content body / prose pages (1008–1053)
- Coupon cards (1054–1124)
- Brands grid (1125–1156)
- Contact grid (1157–1191)
- Footer (1192–1241)
- Sticky bottom bar (1242–1287)
- CTA button alignment helpers (1288–1335)
- Gallery section & carousel (1336–1436)
- Gallery modal (1437–1495)
- Desktop overrides `@media (min-width: 769px)` (1496–1661)
- No-hero-image layout (1663–1681)
- Mobile-only overrides `@media (max-width: 768px)` (1682–1700)

### Design tokens:
- **Primary blue:** `#2563eb`
- **CTA red:** `#ef4444`
- **Hero gradient:** `#1e40af` to `#3b82f6`
- **Body text:** `#1f2937` (dark), `#4b5563` (medium), `#6b7280` (light)
- **Alt backgrounds:** `#f9fafb` (gray), `#eff6ff` (blue)
- **Footer background:** `#1f2937`
- **Font stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`

---

## Assets (`/assets/images/`)

Images are referenced with root-relative paths. Do not move or rename image files without updating all references.

| Directory | Contents |
|-----------|---------|
| `assets/images/appliances/` | Appliance-type JPGs (refrigerator, washer, dryer, dishwasher, oven, stove) |
| `assets/images/brands/` | Brand logos (empty — gitkeep only) |
| `assets/images/cities banner/` | City hero banners — `[city]-desktop.webp` and `[city]-mobile.webp` pairs |
| `assets/images/hero/` | `appliance-repair-denver-hero.webp` (homepage hero), `og-image.jpg` (OG/social) |
| `assets/images/problems/` | Problem-page JPG/WebP images used in gallery and content sections |

City banner images exist for: arvada, aurora, boulder, centennial, denver, englewood, evergreen, golden, highlands-ranch, lakewood, littleton, parker, thornton, westminster, wheat ridge

---

## SEO & Metadata

- Every page includes `<title>`, `<meta name="description">`, and `<link rel="canonical">` tags
- Every page includes Open Graph meta tags (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`, `og:image:width`, `og:image:height`, `og:site_name`)
- OG image: `https://elevaterepair.com/assets/images/hero/og-image.jpg` (1200×630)
- Homepage includes Schema.org `LocalBusiness` structured data (JSON-LD)
- `sitemap.xml` lists all pages with `lastmod`, `changefreq`, and `priority`
- Priority tiers: homepage (1.0), services (0.9), cities (0.8), subpages/brands (0.7), info (0.3–0.8)
- Canonical URLs use `https://elevaterepair.com/` (non-www)

---

## Development Workflow

### Adding a new standard brand page
1. Copy an existing standard brand page (e.g., `bosch-appliance-repair-denver.html`)
2. Update content, `<title>`, `<meta description>`, headings, and canonical URL
3. Keep shared header, footer, sticky bar, and burger script identical
4. Do NOT add a booking form
5. Add `<body class="no-hero-image">`
6. Add the page to `sitemap.xml`
7. Add a link in `brands.html` and footer brand lists

### Adding a new short-name brand page
1. Copy an existing short brand page (e.g., `asko.html`)
2. Update content, title, meta, headings, and canonical URL
3. Keep shared header, footer, sticky bar, and burger script identical
4. Do NOT add a booking form
5. Add `<body class="no-hero-image">`
6. Add the page to `sitemap.xml`
7. Add a link in `brands.html` and footer brand lists

### Adding a new city/neighborhood page
1. Copy an existing city page (e.g., `aurora.html`)
2. Update content, title, meta, headings, canonical, and `source` hidden field value
3. Keep the booking form and all shared components
4. Add `<body class="no-hero-image">` (unless adding a city hero banner image)
5. Add the page to `sitemap.xml`
6. Add a link in `service-areas.html` and footer area lists

### Adding a new city+appliance+problem page
1. Copy an existing city problem page (e.g., `aurora-dishwasher-not-starting.html`)
2. Update content, title, meta, canonical, and `source` hidden field value
3. Keep the booking form and all shared components
4. Use `<body class="no-hero-image">`
5. Add the page to `sitemap.xml`

### Adding a new problem subpage (in service directories)
1. Copy an existing subpage from the relevant service directory
2. Update content, title, meta, and canonical
3. Keep shared header/footer and burger script
4. Do NOT add a booking form
5. Update sibling links in the "Related Problems" section
6. Add to `sitemap.xml`

### Modifying styles
- Edit `/styles.css` only — never create new CSS files
- Follow the existing mobile-first pattern
- Desktop overrides go inside the `@media (min-width: 769px)` block
- Mobile-only overrides go inside `@media (max-width: 768px)` block at the bottom

---

## Key Conventions

- No build tools, bundlers, or preprocessors — this is a plain static HTML site
- No external JavaScript libraries or frameworks
- Phone number across the site: `(720) 575-8432` / `tel:7205758432`
- Business address: 1500 N Grant St, Denver, CO 80203
- CTA copy pattern: "Book Online — Save $25"
- Form submissions go to Google Sheets via Apps Script
- All internal links use root-relative paths (e.g., `/faq.html`, `/dishwasher-repair-denver/`)
- `tools/` directory contains dev scripts only — not deployed, do not reference from HTML pages
- Problems accordion on service landing pages uses native `<details>`/`<summary>` HTML (no JavaScript required)
- Gallery carousel on homepage uses inline JS for arrow navigation
