# Problem Page Generator

Generates problem-subpage HTML files from a template + JSON batch file,
and appends new entries to `sitemap.xml`.

## Files

| File | Purpose |
|------|---------|
| `problem-page-template.html` | HTML template with `{{PLACEHOLDER}}` tokens |
| `pages-batch.json` | Batch definition — one entry per page to generate |
| `generate-problem-pages.mjs` | Node.js script that merges template + JSON → HTML files |

## Quick start

```bash
# From the repo root:

# 1. Dry-run (no files written, shows what would happen)
node tools/generate-problem-pages.mjs

# 2. Write mode (creates HTML files + updates sitemap.xml)
node tools/generate-problem-pages.mjs --write
```

## Workflow

1. **Define pages** — Add entries to `pages-batch.json`. Each entry needs:
   - `dir` — output directory (e.g. `dryer-repair-aurora`)
   - `fileName` — output file (e.g. `dryer-not-heating.html`)
   - `city`, `cityState`, `appliance`, `applianceDir`, `problem`
   - `title`, `metaDesc`, `h1`
   - `heroText` — one-sentence hero paragraph
   - `bodyHtml` — the full content-body HTML (headings, paragraphs, lists)
   - `relatedLinks` — array of 3 `{ href, label }` objects

2. **Generate content** — Use Claude or write manually. Paste the resulting
   HTML into each entry's `bodyHtml` field. Entries with empty `bodyHtml`
   are skipped automatically.

3. **Dry-run** — `node tools/generate-problem-pages.mjs` to verify output paths.

4. **Write** — `node tools/generate-problem-pages.mjs --write` to create files
   and update `sitemap.xml`.

## Template placeholders

| Placeholder | Source field | Example |
|---|---|---|
| `{{TITLE}}` | `title` | `Dryer Not Heating – Aurora, CO \| Elevate Repair` |
| `{{META_DESC}}` | `metaDesc` | `Dryer not heating in Aurora? ...` |
| `{{CANONICAL}}` | auto from `dir`+`fileName` | `https://elevaterepair.com/dryer-repair-aurora/dryer-not-heating.html` |
| `{{H1}}` | `h1` | `Dryer Not Heating in Aurora?` |
| `{{HERO_TEXT}}` | `heroText` | One-sentence hero subtext |
| `{{BODY_HTML}}` | `bodyHtml` | Full `<h2>`/`<p>`/`<ul>` content |
| `{{APPLIANCE}}` | `appliance` | `Dryer` |
| `{{APPLIANCE_DIR}}` | `applianceDir` | `dryer-repair-denver` |
| `{{CITY}}` | `city` | `Aurora` |
| `{{CITY_STATE}}` | `cityState` | `Aurora, CO` |
| `{{PROBLEM}}` | `problem` | `Not Heating` |
| `{{RELATED_LINKS_HTML}}` | built from `relatedLinks[]` | `<a>` tags |

## Content guidelines (for bodyHtml)

- 800–1,100 words, unique per city + problem
- City name mentioned 5–8 times naturally
- Reference Denver metro context but use the correct city name
- Include: "What to check" bullets, "When to call a pro", "Same-day service" CTA
- No fake landmarks or fabricated local details

## Sitemap behavior

- Appends new `<url>` entries before `</urlset>`
- Skips URLs already present (no duplicates)
- Uses `priority` 0.7 and `changefreq` monthly (matches existing subpages)
- Canonical base: `https://elevaterepair.com` (non-www)
