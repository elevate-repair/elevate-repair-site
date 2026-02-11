# CLAUDE.md — Elevate Repair Site

## Project Overview

Static HTML/CSS website for **Elevate Repair**, a local appliance repair business in Denver, CO. No frameworks, no build tools, no JavaScript bundlers. Pages are served as-is from a static host.

- **Domain:** elevaterepair.com
- **Phone:** (720) 575-8432
- **Email:** support@elevaterepair.com
- **Address:** 1500 N Grant St, Denver, CO 80203
- **Hours:** 7am–10pm, 7 days/week

## Rules

- This repository is the single source of truth.
- Do not create artifacts or side files.
- Follow existing file structure and naming conventions.
- One simple form (Name + Phone) per page. No duplicate forms.
- Shared header and footer across all pages — copy from an existing page.
- All CSS goes in `/styles.css` (the root-level stylesheet). Do not add inline styles or new CSS files.
- `/assets/css/style.css` exists but is not used by any pages. Do not link to it.
- Each page must be a separate HTML file.
- No JavaScript frameworks. Inline `<script>` only for Google Analytics and form handling.
- Every new page must be added to `sitemap.xml`.

## Technology Stack

- **HTML5** — semantic markup, no templating engine
- **CSS** — single custom stylesheet (`/styles.css`, ~1,068 lines, mobile-first responsive)
- **JavaScript** — inline only (Google Tag Manager, form submission, Schema.org JSON-LD)
- **Forms** — POST to Google Apps Script, submitted via hidden iframe, redirects to `/thank-you.html`
- **Analytics** — Google Tag Manager ID `AW-17878510208`
- **SEO** — Schema.org LocalBusiness JSON-LD on index.html, meta descriptions on all pages, `sitemap.xml`
- **PWA** — `site.webmanifest` with icons (no service worker)

## File Structure

```
/
├── index.html                              # Homepage
├── contact.html                            # Contact page
├── thank-you.html                          # Post-form-submission confirmation
├── styles.css                              # MAIN STYLESHEET (all pages link here)
├── sitemap.xml                             # 49 URLs with priority/frequency
├── site.webmanifest                        # PWA manifest
├── CLAUDE.md                               # This file
├── README.md                               # Minimal readme
├── favicon.ico / favicon-*.png             # Favicons
├── apple-touch-icon.png                    # iOS icon
├── android-chrome-*.png                    # Android icons
├── assets/css/style.css                    # Legacy/unused minified CSS
│
├── [city].html                             # City/neighborhood landing pages (14)
│   aurora, arvada, centennial, cherry-creek, capitol-hill,
│   downtown-denver, englewood, five-points, highlands,
│   lakewood, littleton, washington-park, wheat-ridge, westminster
│
├── [appliance]-repair-denver.html          # Appliance service pages (5)
│   fridge, washer, dryer, dishwasher, oven
│
├── [brand]-appliance-repair-denver.html    # Brand-specific pages (15)
│   whirlpool, samsung, lg, ge, maytag, kitchenaid, bosch,
│   frigidaire, kenmore, electrolux, amana, panasonic,
│   miele, sub-zero, viking
│
├── fridge-repair-denver/                   # Fridge problem sub-pages (6)
│   refrigerator-not-cooling.html
│   fridge-leaking-water.html
│   ice-maker-not-making-ice.html
│   freezer-not-freezing.html
│   fridge-making-noise.html
│   water-dispenser-not-working.html
│
├── brands.html                             # All brands listing
├── coupons.html                            # Current promotions
├── faq.html                                # Frequently asked questions
├── warranty.html                           # Warranty information
├── service-areas.html                      # Service area listing
├── privacy-policy.html                     # Privacy policy
└── cancellation-policy.html                # Cancellation policy
```

**Total: 50 HTML pages** (44 root-level + 6 in fridge-repair-denver/).

## Page Templates

Every page follows this structure. Copy from the closest existing page type when creating new pages.

### Standard `<head>`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Page Title] | Elevate Repair</title>
    <meta name="description" content="[Unique SEO description]">
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32">
    <link rel="icon" type="image/png" href="/favicon-16x16.png" sizes="16x16">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="stylesheet" href="/styles.css">
    <!-- Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=AW-17878510208"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'AW-17878510208');
    </script>
</head>
```

### Shared Header

```html
<header>
    <div class="container">
        <div class="header-content">
            <a href="/" class="logo">Elevate Repair</a>
            <a href="tel:7205758432" class="header-phone">(720) 575-8432</a>
        </div>
    </div>
</header>
```

### Shared Footer

The footer includes: branding, contact info, Denver neighborhoods links, nearby cities links, appliance repair type links, info page links, and copyright. Copy the full `<footer>` block from any existing page.

### Sticky Mobile CTA Bar

```html
<div class="sticky-bottom-bar">
    <a href="tel:7205758432" class="btn btn-primary">Call Now</a>
    <a href="#book" class="btn btn-secondary">Book Online</a>
</div>
```

### Booking Form Pattern

Forms submit to Google Apps Script via hidden iframe, then redirect to `/thank-you.html`:

```html
<section class="section-blue" id="book">
    <div class="container booking-section">
        <h2>Book Your Repair</h2>
        <form class="booking-form" id="bookingForm" method="POST"
              action="https://script.google.com/macros/s/AKfycbxEVeK-JRHfVoX4oSmsJcuYF5wqn62Zi5qkm_1YmfNpVMkiSdrUBFxNb7cieJ7aCiUEvw/exec"
              target="hidden_iframe">
            <input type="hidden" name="source" value="website-[page-name]">
            <input type="text" name="name" placeholder="Your Name" required>
            <input type="tel" name="phone" placeholder="Phone Number" required>
            <button type="submit" class="btn btn-primary btn-block" id="submitBtn">
                Book Now — Save $25
            </button>
        </form>
        <iframe name="hidden_iframe" style="display:none;"></iframe>
    </div>
</section>
<script>
document.getElementById('bookingForm').addEventListener('submit', function() {
    var btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
});
document.querySelector('iframe[name="hidden_iframe"]').addEventListener('load', function() {
    if (document.getElementById('submitBtn').disabled) {
        window.location.href = '/thank-you.html';
    }
});
</script>
```

## Page Types — When to Use Each

| Type | Naming Pattern | Example | Use For |
|---|---|---|---|
| City/Neighborhood | `[city].html` | `aurora.html` | New service area |
| Appliance Service | `[appliance]-repair-denver.html` | `washer-repair-denver.html` | New appliance type |
| Brand | `[brand]-appliance-repair-denver.html` | `samsung-appliance-repair-denver.html` | New brand |
| Appliance Problem | `[appliance]-repair-denver/[problem].html` | `fridge-repair-denver/fridge-leaking-water.html` | Specific repair issue |
| Info | `[topic].html` | `faq.html` | Informational content |

## CSS Conventions

Stylesheet: `/styles.css` (root level). Mobile-first with breakpoints at 768px and 480px.

### Key CSS Classes

- **Layout:** `.container` (max-width 1200px), `.section-alt`, `.section-blue`
- **Buttons:** `.btn`, `.btn-primary` (red #ef4444), `.btn-secondary` (white/blue), `.btn-outline`, `.btn-block`
- **Hero:** `.hero`, `.page-hero`, `.hero-text`, `.hero-highlights`, `.hero-badge`
- **Grids:** `.services-grid`, `.appliances-grid` (responsive 3→2→1 columns)
- **Cards:** `.service-card`, `.review-card-static`
- **Forms:** `.booking-form`, `.booking-section`
- **Header/Footer:** `header`, `.header-content`, `.logo`, `.header-phone`, `.site-footer`
- **Mobile:** `.sticky-bottom-bar` (visible only on mobile)

### Color Palette

- Primary blue: `#2563eb`
- Dark blue: `#1e40af`
- Red CTA: `#ef4444`
- Dark background: `#1f2937`
- Light gray: `#f3f4f6`, `#eff6ff`
- Hero gradient: `linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)`
- Body text: `#333`

### Typography

System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`

## Checklist for Adding a New Page

1. Copy the closest existing page type as a template.
2. Update `<title>` and `<meta name="description">`.
3. Keep the shared `<head>` block (favicons, manifest, stylesheet, analytics).
4. Keep the shared header and footer unchanged.
5. Keep the sticky mobile CTA bar.
6. Include one booking form (Name + Phone only) with the hidden `source` field set to identify the page.
7. Add the new URL to `sitemap.xml` with appropriate `priority` and `changefreq`.
8. For sub-pages in directories (like `fridge-repair-denver/`), use `../styles.css` for the stylesheet path and `../` prefixes for other root-relative links — or use absolute paths starting with `/`.

## Development Workflow

- **No build step.** Edit HTML/CSS files directly.
- **Local preview:** Open any `.html` file in a browser, or use a local static server.
- **Deployment:** Push to the repository. Static hosting serves files directly.
- **Git:** Commit messages should describe what changed and why. No special conventions beyond clarity.
