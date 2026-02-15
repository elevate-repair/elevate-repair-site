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
├── sitemap.xml                       # XML sitemap (~573 URLs)
├── site.webmanifest                  # PWA manifest
├── CLAUDE.md                         # AI assistant instructions (this file)
├── README.md                         # Minimal readme
├── thank-you.html                    # Post-form-submit redirect
├── favicon.ico / favicon-*.png       # Favicons
├── android-chrome-*.png              # PWA icons
├── apple-touch-icon.png              # iOS icon
│
├── assets/
│   └── css/
│       └── style.css                 # ARCHIVED — not used by any HTML page
│
├── [brand]-appliance-repair-denver.html   # Brand pages (~15)
├── [city/neighborhood].html               # City & neighborhood pages (~20)
├── [appliance]-repair-denver.html         # Service landing pages (5)
│
├── dishwasher-repair-denver/         # Problem subpages (6 each)
├── dryer-repair-denver/
├── fridge-repair-denver/
├── oven-repair-denver/
└── washer-repair-denver/
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

### Page Types (~92 HTML files total)

| Type | Example | Has Form? | Has FAQ? |
|------|---------|-----------|----------|
| Homepage | `index.html` | Yes | Yes |
| Brand page | `bosch-appliance-repair-denver.html` | No | No |
| City/neighborhood page | `aurora.html`, `capitol-hill.html` | Yes | No |
| Service landing page | `dishwasher-repair-denver.html` | No | No |
| Problem subpage | `dishwasher-repair-denver/dishwasher-wont-start.html` | No | No |
| Info page | `faq.html`, `warranty.html`, `contact.html` | Varies | Varies |
| Thank-you page | `thank-you.html` | No | No |

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

---

## Form Pattern

Forms appear only on the homepage and city/neighborhood pages. Structure:

- **Fields:** Name (required), Phone (required), ZIP (optional), Message/Description (optional)
- **Action:** Google Apps Script endpoint (Google Sheets backend)
- **Target:** `hidden_iframe` (prevents page navigation on submit)
- **Hidden field:** `<input type="hidden" name="source" value="website-[location]">` for lead tracking
- **Post-submit:** JavaScript redirects to `/thank-you.html`

Do NOT add forms to brand pages, service landing pages, or problem subpages.

---

## Inline JavaScript (no external JS files)

Three script blocks used across pages:

1. **Google Analytics / Ads** — all pages. Tag ID: `AW-17878510208`
2. **Burger menu toggle** — all pages. IIFE toggling `.nav-open` class
3. **Form submit handler** — only pages with a form. Disables button, shows "Sending...", listens for iframe load, redirects to `/thank-you.html`
4. **FAQ accordion** — homepage only. Toggles `.open` class on `.faq-item`

---

## CSS Architecture (`/styles.css`)

Single file, ~1,266 lines, mobile-first with one `@media (min-width: 769px)` breakpoint.

### Key sections (approximate line ranges):
- Reset & base typography (1–30)
- Header & burger menu (31–123)
- Hero section (125–186)
- Buttons: `.btn-primary` (red `#ef4444`), `.btn-secondary`, `.btn-outline` (218–260)
- Section alternating backgrounds: `.section-alt` (`#f9fafb`), `.section-blue` (`#eff6ff`) (261–295)
- Mid-page CTA band (297–313)
- Service grid, benefits, cost table, area grid (314–560)
- Process steps (572–609)
- FAQ accordion (610–660)
- Booking form (662–704)
- Reviews grid & marquee (706–791)
- Social strip (793–840)
- Final CTA band (842–862)
- Content body / prose pages (864–909)
- Coupon cards (910–980)
- Brands grid (981–1011)
- Contact grid (1013–1047)
- Footer (1048–1096)
- Sticky bottom bar (1098–1140)
- Desktop overrides `@media (min-width: 769px)` (1142–1266)

### Design tokens:
- **Primary blue:** `#2563eb`
- **CTA red:** `#ef4444`
- **Hero gradient:** `#1e40af` to `#3b82f6`
- **Body text:** `#1f2937` (dark), `#4b5563` (medium), `#6b7280` (light)
- **Alt backgrounds:** `#f9fafb` (gray), `#eff6ff` (blue)
- **Footer background:** `#1f2937`
- **Font stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`

---

## SEO & Metadata

- Every page includes `<meta name="description">` and `<title>` tags
- Homepage includes Schema.org `LocalBusiness` structured data (JSON-LD)
- `sitemap.xml` lists all pages with `lastmod`, `changefreq`, and `priority`
- Priority tiers: homepage (1.0), services (0.9), cities (0.8), subpages/brands (0.7), info (0.3–0.8)
- Canonical URLs use `https://elevaterepair.com/` (non-www)

---

## Development Workflow

### Adding a new brand page
1. Copy an existing brand page (e.g., `bosch-appliance-repair-denver.html`)
2. Update content, `<title>`, `<meta description>`, and headings
3. Keep shared header, footer, sticky bar, and burger script identical
4. Do NOT add a booking form
5. Add the page to `sitemap.xml`
6. Add a link in `brands.html` and footer brand lists

### Adding a new city/neighborhood page
1. Copy an existing city page (e.g., `aurora.html`)
2. Update content, title, meta, headings, and `source` hidden field value
3. Keep the booking form and all shared components
4. Add the page to `sitemap.xml`
5. Add a link in `service-areas.html` and footer area lists

### Adding a new problem subpage
1. Copy an existing subpage from the relevant service directory
2. Update content, title, meta
3. Keep shared header/footer and burger script
4. Do NOT add a booking form
5. Update sibling links in the "Related Problems" section
6. Add to `sitemap.xml`

### Modifying styles
- Edit `/styles.css` only — never create new CSS files
- Follow the existing mobile-first pattern
- Desktop overrides go inside the `@media (min-width: 769px)` block at the bottom

---

## Key Conventions

- No build tools, bundlers, or preprocessors — this is a plain static HTML site
- No external JavaScript libraries or frameworks
- Phone number across the site: `(720) 575-8432` / `tel:7205758432`
- Business address: 1500 N Grant St, Denver, CO 80203
- CTA copy pattern: "Book Online — Save $25"
- Form submissions go to Google Sheets via Apps Script
- All internal links use root-relative paths (e.g., `/faq.html`, `/dishwasher-repair-denver/`)
