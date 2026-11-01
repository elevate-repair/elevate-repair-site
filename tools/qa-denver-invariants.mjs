#!/usr/bin/env node
/**
 * Denver invariants guard — proves a change left the business-critical layer untouched.
 *
 *   node tools/qa-denver-invariants.mjs                  compare the working tree with origin/main
 *   node tools/qa-denver-invariants.mjs --base=<ref>     compare with any git ref (e.g. HEAD^1 in CI)
 *
 * For every production page that exists in the base (every .html except tools/, the legacy
 * *-repair-denver/ redirect directories, node_modules/ and .git/) it fails when any of these drift:
 *
 *   - phone: the multiset of tel: hrefs, no "(720) 575-8432" text removed, no other number
 *   - Apps Script endpoints (script.google.com/macros/s/...), every <form>…</form> block, the hidden
 *     iframe and every hidden input (source, service, place_id, zip, city, state …)
 *   - tracking: every gtag('event' / 'config' …) call, every onclick attribute, the gtag.js loader,
 *     Clarity, the thank-you conversion page (byte-identical)
 *   - scripts: a base <script> block may only lose whole lines, and a removed line may not carry
 *     tracking / submit / redirect / storage logic; a new script block may not carry any of it
 *   - SEO: <title>, meta description, robots, canonical, og:* tags, the H1 text, every JSON-LD block
 *     except FAQPage (compared without AggregateRating / Review, which may only be removed) (FAQ schema is reconciled with the visible FAQ by tools/apply-faq.mjs), and no
 *     sitemap URL disappears
 *
 * New pages (in the working tree only) are reported, not compared; they must use the canonical phone
 * format and may not introduce a second Apps Script endpoint.
 *
 * Documented exceptions (each applied to the BASE page before comparing, as exact strings, so any
 * other change still fails):
 *   - the lead-capture migration (tools/apply-lead-capture.mjs migrateLegacy): the legacy submit
 *     handler that treated the hidden iframe's `load` as success is removed, the form-start events
 *     send `form_location` instead of `source`, /book-online confirms through window.erLeadSend;
 *     the managed <script data-er="..."> blocks are stripped from the working page and from the base
 *     (that tool's --check and tools/qa-lead-flow.mjs cover them);
 *   - the header booking button gains its book_click onclick (tools/apply-hero-offers.mjs);
 *   - PAGE_EXCEPTIONS: reviewed changes of one page, each an exact before/after pair (printed when used).
 * The form markup (action, method, fields, `source`), tel links, phone text, gtag configs, the
 * thank-you page and the Ads conversion stay under the guard unchanged.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateLegacy, stripManaged } from './apply-lead-capture.mjs';
import { HEADER_OLD, HEADER_WANT } from './apply-hero-offers.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '--base=origin/main').slice(7);
const LEGACY = /(^|\/)[a-z]+-repair-denver\//;
const isProd = (p) => p.endsWith('.html') && !p.startsWith('tools/') && !LEGACY.test(p) && !p.startsWith('node_modules/');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}
const baseFiles = git(['ls-tree', '-r', '--name-only', BASE]).split('\n').filter(isProd);
const baseRead = (p) => git(['show', `${BASE}:${p}`]);
/**
 * Expected, reviewed changes of a single page, as exact before / after strings applied to the BASE
 * page. Each entry must match exactly once (before in the base, after in the working page); otherwise it
 * is not applied and the change
 * fails as drift. Once the base already contains the "after" text the entry is a no-op.
 */
const PAGE_EXCEPTIONS = {
  // /book-online availability request (PR #240): the first answer after the function has been idle
  // takes 5.3-8.0 s, so the page waits 12 s instead of 5 s, sends a CORS simple request (no
  // Content-Type header, no preflight) and wakes the function on load. No tracking, form or phone change.
  'book-online.html': [
    { why: 'availability request waits TIMEOUT_MS = 12 s (was 5 s)',
      before: "            var OTHER_LABEL = 'Other / Not sure';\n            var activeController = null;\n",
      after: "            var OTHER_LABEL = 'Other / Not sure';\n" +
      "            // Measured 2026-11-01: after the function has been idle its first answer takes 5.3-8.0 s\n" +
      "            // (cold start + three sequential database reads), a warm answer 1.2-1.5 s. The old 5 s limit\n" +
      "            // turned the first date pick into the \"trouble checking available windows\" fallback.\n" +
      "            var TIMEOUT_MS = 12000;\n" +
      "            var activeController = null;\n" },
    { why: 'availability request sent without a Content-Type header (no CORS preflight), 12 s abort',
      before: "                var timer = setTimeout(function() { controller.abort(); }, 5000);\n" +
      "                fetch(ENDPOINT, {\n" +
      "                    method: 'POST',\n" +
      "                    headers: { 'Content-Type': 'application/json' },\n",
      after: "                var timer = setTimeout(function() { controller.abort(); }, TIMEOUT_MS);\n" +
      "                // No custom header: a plain-text body is a CORS \"simple\" request, so the browser skips\n" +
      "                // the preflight round trip; the function parses the body as JSON either way.\n" +
      "                fetch(ENDPOINT, {\n" +
      "                    method: 'POST',\n" },
    { why: 'one warm-up availability request on page load (nothing rendered from it)',
      before: "                loadWindows(date);\n            });\n        })();\n",
      after: "                loadWindows(date);\n            });\n\n" +
      "            // Wake the function while the visitor types name, phone and address, so the date pick gets\n" +
      "            // a warm answer. Nothing is rendered from this request.\n" +
      "            try {\n" +
      "                fetch(ENDPOINT, { method: 'POST', body: JSON.stringify({ date: dateInput.min || '' }) }).catch(function() {});\n" +
      "            } catch (e) { /* availability stays on its fallback */ }\n" +
      "        })();\n" },
  ],
};
const appliedExceptions = [];
const once = (hay, needle) => hay.split(needle).length === 2;
/** Applies a page's reviewed changes to the base, each only when the base still has the "before" text
 *  and the working page has exactly the "after" text; any other edit stays drift and fails. */
function pageExceptions(page, src, work) {
  for (const x of PAGE_EXCEPTIONS[page] || []) {
    if (once(src, x.before) && once(work, x.after)) { src = src.replace(x.before, () => x.after); appliedExceptions.push(`${page}: ${x.why}`); }
  }
  return src;
}
/**
 * The base page with the documented exceptions applied (see the header). The managed
 * <script data-er="..."> blocks are stripped from the base exactly as from the working page: since the
 * lead-capture migration the base pages carry them too, and tools/apply-lead-capture.mjs --check and
 * tools/qa-lead-flow.mjs cover them.
 */
const expectedFromBase = (src, page, work) => pageExceptions(page, migrateLegacy(stripManaged(src)).replace(HEADER_OLD, () => HEADER_WANT), work);

function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    if (n === '.git' || n === 'node_modules') continue;
    const f = join(d, n);
    if (statSync(f).isDirectory()) walk(f, out);
    else out.push(relative(ROOT, f).split(sep).join('/'));
  }
  return out;
}
const workFiles = walk(ROOT).filter(isProd);

const ms = (arr) => arr.slice().sort().join('\n');
const all = (re, s) => [...s.matchAll(re)].map((m) => m[0]);
const PROTECTED_LINE = /gtag|dataLayer|clarity|sessionStorage|localStorage|hidden_iframe|lead_submitted|fetch\(|XMLHttpRequest|submit|location\.href|thank-you|phone|source|script\.google|ec_name|ec_phone|booking_/i;

function withoutRatings(block) {
  try {
    const strip = (o) => {
      if (Array.isArray(o)) return o.filter((x) => !(x && (x['@type'] === 'Review' || x['@type'] === 'AggregateRating'))).map(strip);
      if (o && typeof o === 'object') { const c = {}; for (const [k, v] of Object.entries(o)) if (k !== 'aggregateRating' && k !== 'review') c[k] = strip(v); return c; }
      return o;
    };
    return JSON.stringify(strip(JSON.parse(block)));
  } catch (e) { return 'UNPARSEABLE ' + block; }
}

function facts(src) {
  const scripts = [...src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1].trim(), body: m[2] }));
  const ld = scripts.filter((s) => /ld\+json/.test(s.attrs)).map((s) => s.body.trim());
  return {
    tel: ms(all(/href="tel:[^"]*"/g, src)),
    // visible copy only: FAQPage JSON-LD is rebuilt from the visible FAQ by tools/sync-faq-schema.js
    phoneText: (src.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '').match(/\(720\) 575-8432/g) || []).length,
    endpoints: ms(all(/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/g, src)),
    forms: ms(all(/<form\b[\s\S]*?<\/form>/g, src)),
    iframe: ms(all(/<iframe\b[^>]*hidden_iframe[^>]*>/g, src)),
    hidden: ms(all(/<input\b[^>]*type="hidden"[^>]*>/g, src)),
    gtagCalls: ms(all(/gtag\(\s*'(?:event|config|js)'[^;]*?\)/g, src)),
    onclick: ms(all(/onclick="[^"]*"/g, src)),
    loader: ms(all(/<script async src="https:\/\/www\.googletagmanager\.com[^"]*"><\/script>/g, src)),
    clarity: ms(scripts.filter((s) => /clarity/.test(s.body) && !/ld\+json/.test(s.attrs)).map((s) => s.body)),
    title: (src.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '',
    desc: (src.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '',
    robots: (src.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || '',
    canonical: (src.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '',
    og: ms(all(/<meta property="og:[^"]+" content="[^"]*"/g, src)),
    h1: ((src.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    h1count: (src.match(/<h1[\s>]/g) || []).length,
    // non-FAQ JSON-LD, compared without AggregateRating / Review: those were removed on purpose
    // (unverifiable rating claims) and may never come back — everything else must stay identical
    ldNonFaq: ms(ld.filter((b) => !/"FAQPage"/.test(b)).map(withoutRatings)),
    ratingSchema: ld.some((b) => /"aggregateRating"|"AggregateRating"|"@type":\s*"Review"/.test(b)),
    scripts: scripts.filter((s) => !/ld\+json/.test(s.attrs)),
  };
}

const errors = [];
const err = (p, m) => errors.push(`${p}: ${m}`);

// a base script may only lose whole lines; removed lines may not carry protected logic
function scriptDrift(page, baseScripts, workScripts) {
  const unmatchedWork = workScripts.slice();
  for (const b of baseScripts) {
    const exact = unmatchedWork.findIndex((w) => w.attrs === b.attrs && w.body === b.body);
    if (exact >= 0) { unmatchedWork.splice(exact, 1); continue; }
    // find a work block with the same attrs whose lines are an ordered subsequence of the base lines
    const bl = b.body.split('\n');
    let found = -1, removed = [];
    for (let i = 0; i < unmatchedWork.length; i++) {
      const w = unmatchedWork[i];
      if (w.attrs !== b.attrs) continue;
      const wl = w.body.split('\n');
      let j = 0; const rem = [];
      for (const line of bl) { if (j < wl.length && wl[j] === line) j++; else rem.push(line); }
      if (j === wl.length && wl.length > 0) { found = i; removed = rem; break; }
    }
    if (found < 0) {
      if (!b.attrs.includes('src=')) err(page, `script block changed beyond line removals (attrs "${b.attrs}", ${b.body.length} chars)`);
      else err(page, `external script removed: ${b.attrs}`);
      continue;
    }
    unmatchedWork.splice(found, 1);
    for (const line of removed) if (PROTECTED_LINE.test(line)) err(page, `removed a protected script line: ${line.trim().slice(0, 120)}`);
  }
  for (const w of unmatchedWork) {
    if (PROTECTED_LINE.test(w.body) || /src=/.test(w.attrs)) err(page, `new script block carries protected logic or an external src: ${w.body.trim().slice(0, 120)}`);
  }
}

for (const p of baseFiles) {
  if (!existsSync(join(ROOT, p))) { err(p, 'page removed'); continue; }
  const wSrc = readFileSync(join(ROOT, p), 'utf8');
  const b = facts(expectedFromBase(baseRead(p), p, wSrc));
  const w = facts(stripManaged(wSrc));
  if (p === 'thank-you.html' && wSrc !== baseRead(p)) err(p, 'thank-you page changed (conversion page must stay byte-identical)');
  // the number itself never changes; a FAQ answer made visible may repeat it (as text, never a new tel link)
  if (w.phoneText < b.phoneText) err(p, 'phone number text removed');
  if (/\(720\) (?!575-8432|000-0000)\d{3}-\d{4}/.test(wSrc)) err(p, 'unexpected phone number');
  for (const k of ['tel', 'endpoints', 'forms', 'iframe', 'hidden', 'gtagCalls', 'onclick', 'loader', 'clarity',
    'title', 'desc', 'robots', 'canonical', 'og', 'h1', 'h1count', 'ldNonFaq']) {
    if (b[k] !== w[k]) err(p, `${k} changed`);
  }
  if (w.ratingSchema) err(p, 'AggregateRating / Review schema present');
  scriptDrift(p, b.scripts, w.scripts);
}

// sitemap: no base URL disappears
const locs = (s) => new Set([...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
const baseLocs = locs(baseRead('sitemap.xml'));
const workLocs = locs(readFileSync(join(ROOT, 'sitemap.xml'), 'utf8'));
for (const u of baseLocs) if (!workLocs.has(u)) err('sitemap.xml', `URL removed: ${u}`);
const addedLocs = [...workLocs].filter((u) => !baseLocs.has(u));

// new pages: canonical phone format, the one standard endpoint at most
const baseSet = new Set(baseFiles);
const newPages = workFiles.filter((p) => !baseSet.has(p));
for (const p of newPages) {
  const s = readFileSync(join(ROOT, p), 'utf8');
  for (const t of all(/href="tel:[^"]*"/g, s)) if (t !== 'href="tel:7205758432"') err(p, `non-canonical tel link ${t}`);
  for (const e of all(/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/g, s)) err(p, `new page posts to Apps Script ${e}`);
  if (/\(720\) (?!575-8432|000-0000)\d{3}-\d{4}/.test(s)) err(p, 'unexpected phone number');
}

console.log(`Denver invariants vs ${BASE}: ${baseFiles.length} base pages compared, ${newPages.length} new page(s)` +
  (newPages.length ? ` (${newPages.join(', ')})` : '') + `, ${addedLocs.length} sitemap URL(s) added.`);
if (appliedExceptions.length) {
  console.log(`Expected changes of this branch (exact-string exceptions, see PAGE_EXCEPTIONS):`);
  for (const e of appliedExceptions) console.log('  ' + e);
}
if (errors.length) {
  console.log(`FAIL - ${errors.length} problem(s):`);
  for (const e of errors.slice(0, 200)) console.log('  ' + e);
  process.exit(1);
}
console.log('PASS - phone, Apps Script, forms, source, tracking, scripts and SEO head are unchanged.');
