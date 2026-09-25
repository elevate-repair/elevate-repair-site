#!/usr/bin/env node
/**
 * render-smoke-test.mjs
 *
 * Renders Denver pages in a real browser and asserts the Google tag
 * architecture actually behaves correctly at runtime (not just in source):
 *
 *   1. Exactly one base gtag.js loader request is made.
 *   2. That request is for GT-PBSXVWKK.
 *   3. No gtag.js request is made for G-YJVEJZRS5W or AW-17878510208.
 *   4. dataLayer receives config commands for GT-PBSXVWKK and AW-17878510208.
 *   5. dataLayer receives no config for G-YJVEJZRS5W.
 *   6. The page renders its shared header/footer with no console errors.
 *
 * Requests to googletagmanager.com are intercepted and stubbed, so the suite
 * is hermetic and never depends on outbound network access.
 *
 * Usage:  node tools/render-smoke-test.mjs [--all]
 *         --all  render every HTML page instead of the representative sample
 * Exit:   0 = pass (or skipped when Playwright is unavailable), 1 = failure
 */

import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const GOOGLE_TAG = 'GT-PBSXVWKK';
const ADS_ID     = 'AW-17878510208';
const GA4_ID     = 'G-YJVEJZRS5W';

// One page per page type defined in CLAUDE.md.
const SAMPLE = [
  'index.html',                                        // homepage
  'aurora.html',                                       // city w/ problem pages
  'boulder.html',                                      // city w/o problem pages
  'arvada.html',                                       // city, variant tag block
  'denver-dishwasher-not-starting.html',               // denver+problem
  'aurora-dishwasher-not-starting.html',               // city+problem
  'denver-bosch-dryer-not-starting.html',              // brand+city+problem
  'bosch-appliance-repair-denver.html',                // standard brand
  'asko.html',                                         // short brand
  'dishwasher-repair-denver.html',                     // service landing
  'dishwasher-repair/dishwasher-wont-start.html',      // canonical subpage
  'dishwasher-repair-denver/dishwasher-wont-start.html', // legacy subpage
  'book.html',                                         // booking form
  'book-online.html',                                  // book-it-now flow
  'contact.html',                                      // contact form
  'faq.html',                                          // info page
  'thank-you.html',                                    // conversion page
];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('Render smoke test SKIPPED - playwright is not installed.');
  console.log('Install with: npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

async function collectHtml(dir, out = []) {
  for (const entry of await readdir(dir)) {
    if (['.git', 'node_modules', 'assets', 'tools'].includes(entry)) continue;
    const full = join(dir, entry);
    if ((await stat(full)).isDirectory()) await collectHtml(full, out);
    else if (entry.endsWith('.html')) out.push(relative(ROOT, full).split(sep).join('/'));
  }
  return out;
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  try {
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const pages = process.argv.includes('--all') ? await collectHtml(ROOT) : SAMPLE;
const browser = await chromium.launch();
const failures = [];
let passed = 0;

// One context for the whole run. Pages are rendered sequentially and each gets
// a fresh tab, so window.dataLayer is always page-scoped.
const ctx = await browser.newContext();

let tagRequests = [];

// Stub every third-party request so the suite is hermetic and never depends on
// outbound network access. The URL predicate means same-origin requests are
// never routed through Node, which keeps local asset loading fast.
await ctx.route(
  (url) => url.hostname !== '127.0.0.1',
  (route) => {
    const url = route.request().url();
    if (url.includes('googletagmanager.com')) tagRequests.push(url);
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stubbed third party */' });
  }
);

for (const page of pages) {
  const tab = await ctx.newPage();

  tagRequests = [];
  const consoleErrors = [];

  tab.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  tab.on('pageerror', (e) => consoleErrors.push(String(e)));

  const fail = (msg) => failures.push(`${page}: ${msg}`);

  try {
    const resp = await tab.goto(`${base}/${page}`, { waitUntil: 'load', timeout: 30000 });
    if (!resp || !resp.ok()) { fail(`did not load (HTTP ${resp ? resp.status() : 'none'})`); continue; }

    // --- loader assertions -------------------------------------------------
    const loaders = tagRequests
      .filter((u) => u.includes('/gtag/js'))
      .map((u) => new URL(u).searchParams.get('id'));

    if (loaders.length !== 1) {
      fail(`expected exactly 1 gtag.js loader request, got ${loaders.length} (${loaders.join(', ') || 'none'})`);
    }
    if (!loaders.includes(GOOGLE_TAG)) fail(`did not request gtag.js for ${GOOGLE_TAG}`);
    if (loaders.includes(GA4_ID))      fail(`requested gtag.js for ${GA4_ID} (must load via ${GOOGLE_TAG})`);
    if (loaders.includes(ADS_ID))      fail(`requested gtag.js for ${ADS_ID} as the primary loader`);

    // --- dataLayer assertions ---------------------------------------------
    const configs = await tab.evaluate(() =>
      (window.dataLayer || [])
        .filter((a) => a && a[0] === 'config')
        .map((a) => a[1])
    );

    if (!configs.includes(GOOGLE_TAG)) fail(`dataLayer has no config for ${GOOGLE_TAG} (got: ${configs.join(', ') || 'none'})`);
    if (!configs.includes(ADS_ID))     fail(`dataLayer has no config for ${ADS_ID} - Ads config must survive`);
    if (configs.includes(GA4_ID))      fail(`dataLayer configures ${GA4_ID} directly`);

    // --- render assertions -------------------------------------------------
    // Shared components are asserted only where the source declares them, so
    // standalone pages (e.g. thank-you.html) are not held to the site chrome.
    const src = await readFile(join(ROOT, page), 'utf-8');
    const expect = [
      ['<header',             'header',               'shared <header>'],
      ['class="site-footer"', 'footer.site-footer',   'shared site footer'],
      ['sticky-bottom-bar',   '.sticky-bottom-bar',   'sticky bottom bar'],
      ['<form',               'form',                 'booking form'],
    ];
    const layout = await tab.evaluate(
      (sels) => sels.map((s) => !!document.querySelector(s)),
      expect.map((e) => e[1])
    );
    expect.forEach(([needle, , label], i) => {
      if (src.includes(needle) && !layout[i]) fail(`${label} is in the source but did not render`);
    });

    if (!(await tab.evaluate(() => typeof window.gtag === 'function'))) {
      fail('window.gtag is not a function');
    }

    if (consoleErrors.length) fail(`console errors: ${consoleErrors.slice(0, 2).join(' | ')}`);

    passed++;
  } catch (err) {
    fail(`render threw: ${String(err).split('\n')[0]}`);
  } finally {
    await tab.close();
  }
}

await ctx.close();
await browser.close();
server.close();

console.log(`Render smoke test - rendered ${pages.length} page(s) in Chromium.`);
console.log(`  asserted loader : ${GOOGLE_TAG} (exactly one)`);
console.log(`  asserted configs: ${GOOGLE_TAG}, ${ADS_ID}`);
console.log(`  asserted absent : ${GA4_ID} loader + config\n`);

if (failures.length) {
  console.error(`FAIL - ${failures.length} render smoke failure(s):\n`);
  for (const f of failures) console.error(`  x ${f}`);
  process.exit(1);
}

console.log(`PASS - ${passed}/${pages.length} page(s) render with the correct Google tag at runtime.`);
