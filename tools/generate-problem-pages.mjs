#!/usr/bin/env node

/**
 * generate-problem-pages.mjs
 *
 * Reads pages-batch.json + problem-page-template.html,
 * generates HTML files into nested folder structure,
 * and appends new entries to sitemap.xml.
 *
 * Usage:
 *   node tools/generate-problem-pages.mjs              # dry-run (default)
 *   node tools/generate-problem-pages.mjs --dry-run    # explicit dry-run
 *   node tools/generate-problem-pages.mjs --write      # actually write files
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ── CLI flags ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const writeMode = args.includes('--write');
const dryRun = !writeMode; // default is dry-run

if (dryRun) {
  console.log('=== DRY-RUN MODE (no files will be written) ===\n');
} else {
  console.log('=== WRITE MODE ===\n');
}

// ── Load inputs ────────────────────────────────────────────────────────
const batchPath = join(__dirname, 'pages-batch.json');
const templatePath = join(__dirname, 'problem-page-template.html');

let batch;
try {
  batch = JSON.parse(readFileSync(batchPath, 'utf-8'));
} catch (err) {
  console.error(`Error reading ${batchPath}: ${err.message}`);
  process.exit(1);
}

let template;
try {
  template = readFileSync(templatePath, 'utf-8');
} catch (err) {
  console.error(`Error reading ${templatePath}: ${err.message}`);
  process.exit(1);
}

const pages = batch.pages;
if (!Array.isArray(pages) || pages.length === 0) {
  console.error('No pages found in pages-batch.json');
  process.exit(1);
}

const canonicalBase = (batch.meta && batch.meta.canonicalBase) || 'https://elevaterepair.com';

// ── Validate entries ───────────────────────────────────────────────────
const requiredFields = ['dir', 'fileName', 'city', 'cityState', 'appliance', 'applianceDir', 'problem', 'title', 'metaDesc', 'h1'];
const errors = [];
const skipped = [];

for (let i = 0; i < pages.length; i++) {
  const p = pages[i];
  const label = `pages[${i}] (${p.dir || '?'}/${p.fileName || '?'})`;

  for (const field of requiredFields) {
    if (!p[field]) {
      errors.push(`${label}: missing required field "${field}"`);
    }
  }

  if (!p.bodyHtml || p.bodyHtml.trim() === '') {
    skipped.push(label);
  }
}

if (errors.length > 0) {
  console.error('Validation errors:\n  ' + errors.join('\n  '));
  process.exit(1);
}

if (skipped.length > 0) {
  console.log(`⚠  ${skipped.length} page(s) have empty bodyHtml and will be skipped:`);
  for (const s of skipped) {
    console.log(`   - ${s}`);
  }
  console.log('');
}

// ── Filter to pages with content ──────────────────────────────────────
const pagesToGenerate = pages.filter(p => p.bodyHtml && p.bodyHtml.trim() !== '');

if (pagesToGenerate.length === 0) {
  console.log('No pages with bodyHtml content to generate. Fill in bodyHtml fields and re-run.');
  process.exit(0);
}

console.log(`Generating ${pagesToGenerate.length} page(s)...\n`);

// ── Build related links HTML ───────────────────────────────────────────
function buildRelatedLinksHtml(relatedLinks) {
  if (!Array.isArray(relatedLinks) || relatedLinks.length === 0) return '';
  return relatedLinks
    .map(link => `                <a href="${link.href}" class="city-link">${link.label}</a>`)
    .join('\n');
}

// ── Replace placeholders in template ───────────────────────────────────
function renderPage(page) {
  const canonical = `${canonicalBase}/${page.dir}/${page.fileName}`;
  const relatedHtml = buildRelatedLinksHtml(page.relatedLinks);

  let html = template;
  html = html.replace(/\{\{TITLE\}\}/g, page.title);
  html = html.replace(/\{\{META_DESC\}\}/g, page.metaDesc);
  html = html.replace(/\{\{CANONICAL\}\}/g, page.canonical || canonical);
  html = html.replace(/\{\{H1\}\}/g, page.h1);
  html = html.replace(/\{\{HERO_TEXT\}\}/g, page.heroText || '');
  html = html.replace(/\{\{BODY_HTML\}\}/g, page.bodyHtml);
  html = html.replace(/\{\{APPLIANCE\}\}/g, page.appliance);
  html = html.replace(/\{\{APPLIANCE_DIR\}\}/g, page.applianceDir);
  html = html.replace(/\{\{CITY\}\}/g, page.city);
  html = html.replace(/\{\{CITY_STATE\}\}/g, page.cityState);
  html = html.replace(/\{\{PROBLEM\}\}/g, page.problem);
  html = html.replace(/\{\{RELATED_LINKS_HTML\}\}/g, relatedHtml);

  return html;
}

// ── Write HTML files ───────────────────────────────────────────────────
const written = [];

for (const page of pagesToGenerate) {
  const dirPath = join(ROOT, page.dir);
  const filePath = join(dirPath, page.fileName);
  const relPath = `${page.dir}/${page.fileName}`;

  const html = renderPage(page);

  if (dryRun) {
    console.log(`[dry-run] Would write: ${relPath} (${html.length} bytes)`);
  } else {
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(filePath, html, 'utf-8');
    console.log(`  Wrote: ${relPath}`);
  }

  written.push(page);
}

// ── Update sitemap.xml ─────────────────────────────────────────────────
const sitemapPath = join(ROOT, 'sitemap.xml');

if (existsSync(sitemapPath)) {
  let sitemap = readFileSync(sitemapPath, 'utf-8');

  // Collect existing URLs to avoid duplicates
  const existingUrls = new Set();
  const locRegex = /<loc>([^<]+)<\/loc>/g;
  let match;
  while ((match = locRegex.exec(sitemap)) !== null) {
    existingUrls.add(match[1]);
  }

  const today = new Date().toISOString().slice(0, 10);
  const newEntries = [];

  for (const page of written) {
    const url = `${canonicalBase}/${page.dir}/${page.fileName}`;
    if (existingUrls.has(url)) {
      if (dryRun) {
        console.log(`[dry-run] Sitemap: already exists — ${url}`);
      } else {
        console.log(`  Sitemap: already exists — ${url}`);
      }
      continue;
    }

    const entry = [
      '  <url>',
      `    <loc>${url}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      '    <changefreq>monthly</changefreq>',
      '    <priority>0.7</priority>',
      '  </url>',
    ].join('\n');

    newEntries.push(entry);
  }

  if (newEntries.length > 0) {
    // Insert before closing </urlset>
    const closingTag = '</urlset>';
    const insertionPoint = sitemap.lastIndexOf(closingTag);

    if (insertionPoint === -1) {
      console.error('Could not find </urlset> in sitemap.xml');
      process.exit(1);
    }

    const updatedSitemap =
      sitemap.slice(0, insertionPoint) +
      newEntries.join('\n') + '\n' +
      closingTag + '\n';

    if (dryRun) {
      console.log(`\n[dry-run] Would add ${newEntries.length} new sitemap entries`);
    } else {
      writeFileSync(sitemapPath, updatedSitemap, 'utf-8');
      console.log(`\n  Added ${newEntries.length} new sitemap entries`);
    }
  } else {
    console.log('\nNo new sitemap entries needed (all URLs already present).');
  }
} else {
  console.log('\nsitemap.xml not found — skipping sitemap update.');
}

// ── Summary ────────────────────────────────────────────────────────────
console.log('\n─── Summary ───');
console.log(`Mode:           ${dryRun ? 'dry-run' : 'write'}`);
console.log(`Total in batch: ${pages.length}`);
console.log(`Skipped (empty): ${skipped.length}`);
console.log(`Generated:      ${written.length}`);
console.log('');

if (dryRun && written.length > 0) {
  console.log('Run with --write to create the files.');
}
