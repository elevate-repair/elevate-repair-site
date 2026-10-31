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
 *   - phone: the multiset of tel: hrefs and of "(720) 575-8432" texts
 *   - Apps Script endpoints (script.google.com/macros/s/...), every <form>…</form> block, the hidden
 *     iframe and every hidden input (source, service, place_id, zip, city, state …)
 *   - tracking: every gtag('event' / 'config' …) call, every onclick attribute, the gtag.js loader,
 *     Clarity, the thank-you conversion page (byte-identical)
 *   - scripts: a base <script> block may only lose whole lines, and a removed line may not carry
 *     tracking / submit / redirect / storage logic; a new script block may not carry any of it
 *   - SEO: <title>, meta description, robots, canonical, og:* tags, the H1 text, every JSON-LD block
 *     except FAQPage (FAQ schema is reconciled with the visible FAQ by tools/apply-faq.mjs), and no
 *     sitemap URL disappears
 *
 * New pages (in the working tree only) are reported, not compared; they must use the canonical phone
 * format and may not introduce a second Apps Script endpoint.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '--base=origin/main').slice(7);
const LEGACY = /(^|\/)[a-z]+-repair-denver\//;
const isProd = (p) => p.endsWith('.html') && !p.startsWith('tools/') && !LEGACY.test(p) && !p.startsWith('node_modules/');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}
const baseFiles = git(['ls-tree', '-r', '--name-only', BASE]).split('\n').filter(isProd);
const baseRead = (p) => git(['show', `${BASE}:${p}`]);

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

function facts(src) {
  const scripts = [...src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1].trim(), body: m[2] }));
  const ld = scripts.filter((s) => /ld\+json/.test(s.attrs)).map((s) => s.body.trim());
  return {
    tel: ms(all(/href="tel:[^"]*"/g, src)),
    phoneText: (src.match(/\(720\) 575-8432/g) || []).length,
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
    ldNonFaq: ms(ld.filter((b) => !/"FAQPage"/.test(b))),
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
  const b = facts(baseRead(p));
  const wSrc = readFileSync(join(ROOT, p), 'utf8');
  const w = facts(wSrc);
  if (p === 'thank-you.html' && wSrc !== baseRead(p)) err(p, 'thank-you page changed (conversion page must stay byte-identical)');
  for (const k of ['tel', 'phoneText', 'endpoints', 'forms', 'iframe', 'hidden', 'gtagCalls', 'onclick', 'loader', 'clarity',
    'title', 'desc', 'robots', 'canonical', 'og', 'h1', 'h1count', 'ldNonFaq']) {
    if (b[k] !== w[k]) err(p, `${k} changed`);
  }
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
  if (/\(720\) (?!575-8432)\d{3}-\d{4}/.test(s)) err(p, 'unexpected phone number');
}

console.log(`Denver invariants vs ${BASE}: ${baseFiles.length} base pages compared, ${newPages.length} new page(s)` +
  (newPages.length ? ` (${newPages.join(', ')})` : '') + `, ${addedLocs.length} sitemap URL(s) added.`);
if (errors.length) {
  console.log(`FAIL - ${errors.length} problem(s):`);
  for (const e of errors.slice(0, 200)) console.log('  ' + e);
  process.exit(1);
}
console.log('PASS - phone, Apps Script, forms, source, tracking, scripts and SEO head are unchanged.');
