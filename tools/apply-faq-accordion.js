#!/usr/bin/env node
/**
 * FAQ accordion — one structure for every FAQ on the site. Propagate + drift check.
 *
 *   node tools/apply-faq-accordion.js           convert every legacy FAQ block
 *   node tools/apply-faq-accordion.js --check   report legacy / malformed blocks, exit 1 if any
 *
 * Every FAQ question on the site is a native disclosure (no JavaScript, no library):
 *
 *   <div class="faq-list">
 *       <details class="faq-item">
 *           <summary class="faq-question">Question?</summary>
 *           <div class="faq-answer"><p>Answer …</p></div>
 *       </details>
 *   </div>
 *
 * Closed on load, the whole question row toggles it, several can be open at once,
 * the summary is keyboard-operable (Tab, Enter, Space) with a visible focus ring
 * and exposes its expanded / collapsed state to assistive technology, and the
 * browser opens the item when a link targets an element inside it. The full
 * answer stays in the HTML. Styles: .faq-list / .faq-item / .faq-question /
 * .faq-answer in styles.css (the /faq card look: border, question row, +/−).
 *
 * Legacy blocks it converts (question and answer markup are carried over verbatim):
 *   - <div class="faq-item"><div class="faq-question">Q</div><div class="faq-answer">A</div></div>
 *     (homepage and /faq, which toggled an .open class with a script)
 *   - "Frequently Asked Questions" sections written as <h3>Q</h3> + <p>A</p> pairs
 *     (city, service and repair-or-replace pages) or <p><strong>Q?</strong> A</p>
 *     pairs (the symptom guides)
 *   - "Common Questions About …" sections on the problem pages, written as
 *     <p><strong>Q:</strong> q<br><strong>A:</strong> a</p>, <p><strong>Q?</strong> A</p>
 *     or <p>Q? A</p> where Q is a question of the page's FAQPage schema ("Q:" /
 *     "A:" labels are the list's markers and are dropped; the schema never had
 *     them). The narrative paragraphs of those sections (`One question we often
 *     hear is, "…?" …`) and the cross-link paragraphs that carry an attribute
 *     (<p style="…">) are not FAQ items and are left alone.
 *
 * A page is only written when the (question, answer) text pairs read back from
 * the new markup equal the pairs read from the legacy markup, so no question,
 * answer, price or link can be lost or reworded. (Shared with the Buffalo site,
 * where it was written; it carries no market-specific rule.) Idempotent. Page set: every
 * .html except tools/, *-repair-denver/, node_modules/, .git/.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');
const EXCLUDE = new Set(['.git', 'node_modules', 'tools']);
const LEGACY = /(^|\/)[a-z]+-repair-denver(\/|$)/;

function walk(d, out) {
  for (const n of fs.readdirSync(d)) {
    const f = path.join(d, n);
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    if (fs.statSync(f).isDirectory()) { if (EXCLUDE.has(n) || LEGACY.test(rel + '/')) continue; walk(f, out); }
    else if (n.endsWith('.html') && !LEGACY.test(rel)) out.push(rel);
  }
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', eacute: 'é', hellip: '…', bull: '•', copy: '©' };
const decode = (s) => s.replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const toText = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9$%]+/g, ' ').trim();
const lineIndent = (s, at) => { const ls = s.lastIndexOf('\n', at - 1) + 1; return (s.slice(ls, at).match(/^[ \t]*/) || [''])[0]; };

// questions of the page's FAQPage schema (normalized), used to recognise <p>Q? A</p> items
function schemaQuestions(src) {
  const out = new Set();
  for (const m of src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data; try { data = JSON.parse(m[1]); } catch (e) { continue; }
    const visit = (o) => {
      if (Array.isArray(o)) { o.forEach(visit); return; }
      if (!o || typeof o !== 'object') return;
      if ([].concat(o['@type']).includes('FAQPage')) for (const q of [].concat(o.mainEntity || [])) if (q && q.name) out.add(norm(q.name));
      Object.values(o).forEach(visit);
    };
    visit(data);
  }
  return out;
}

// ---- the unified markup ----------------------------------------------------
function renderItem(ind, q, answerHtml) {
  const i1 = ind + '    ', i2 = ind + '        ';
  return `${i1}<details class="faq-item">\n${i2}<summary class="faq-question">${q}</summary>\n${i2}<div class="faq-answer">${answerHtml}</div>\n${i1}</details>`;
}
function renderList(ind, items) {
  return `${ind}<div class="faq-list">\n${items.map(([q, a]) => renderItem(ind, q, a)).join('\n')}\n${ind}</div>`;
}
const ITEM_RE = /<details class="faq-item">\s*<summary class="faq-question">([\s\S]*?)<\/summary>\s*<div class="faq-answer">([\s\S]*?)<\/div>\s*<\/details>/g;
const pairsFromItems = (html) => [...html.matchAll(ITEM_RE)].map(m => [toText(m[1]), toText(m[2])]);

// ---- legacy forms -----------------------------------------------------------
const A_RE = /^([ \t]*)<div class="faq-item">\s*<div class="faq-question">([\s\S]*?)<\/div>\s*<div class="faq-answer">([\s\S]*?)<\/div>\s*<\/div>/gm;
const FAQ_H2_RE = /<h2[^>]*>[^<]*Frequently Asked Questions[^<]*<\/h2>/g;
const CQ_H2_RE = /<h2>Common Questions About[^<]*<\/h2>/g;
const P_RE = /<p(\s[^>]*)?>([\s\S]*?)<\/p>/g;

// classify one paragraph; returns [questionHtml, answerHtml] or null
// "Q:" / "A:" labels are the legacy list's markers, not part of the question or
// answer (the FAQPage schema never carried them); the accordion replaces them.
const unlabel = (q, a) => [q.replace(/^\s*Q:\s*/, '').trim(), a.replace(/^\s*A:\s*/, '').trim()];
function paragraphItem(attrs, inner, schema) {
  if (attrs) return null;                                              // <p style="…"> cross-links are not FAQ items
  let m = inner.match(/^\s*<strong>Q:<\/strong>\s*([\s\S]*?)\s*(?:<br\s*\/?>\s*)*<strong>A:<\/strong>\s*([\s\S]*?)\s*$/);
  if (m) return unlabel(m[1], m[2]);
  m = inner.match(/^\s*<strong>([^<]*\?)<\/strong>\s*([\s\S]*?)\s*$/);
  if (m) return unlabel(m[1], m[2]);
  m = inner.match(/^\s*([^<]*?\?)\s+([\s\S]*?)\s*$/);
  if (m && schema.has(norm(decode(m[1])))) return [m[1].trim(), m[2].trim()];
  return null;
}

// items inside one region: h3 + answer blocks, or eligible paragraphs. Returns the
// region rewritten, the legacy pairs it held, and whether anything legacy was found.
function convertRegion(region, schema, baseIndent) {
  const h3s = [...region.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)];
  if (h3s.length) {
    // the items run from the first <h3> to the last closing block before the wrapper closes
    const endM = [...region.matchAll(/<\/(?:p|ul|ol)>/g)].pop();
    if (!endM) return { error: 'FAQ section with <h3> questions but no answer block' };
    const end = endM.index + endM[0].length;
    if (!/^(\s|<\/div>)*$/.test(region.slice(end))) return { error: 'content after the last FAQ answer is not just closing tags' };
    const pairs = [], items = [];
    h3s.forEach((h, i) => {
      const aStart = h.index + h[0].length;
      const aEnd = i + 1 < h3s.length ? h3s[i + 1].index : end;
      const a = region.slice(aStart, aEnd).trim();
      if (!a) return;
      pairs.push([toText(h[1]), toText(a)]);
      items.push([h[1].trim(), a]);
    });
    if (items.length !== h3s.length) return { error: 'an <h3> question without an answer' };
    const ind = lineIndent(region, h3s[0].index) || baseIndent;
    const out = region.slice(0, h3s[0].index) + renderList(ind, items).replace(/^[ \t]*/, '') + region.slice(end);
    return { out, pairs, legacy: true };
  }
  // paragraph forms, wrapped per contiguous run
  const paras = [...region.matchAll(P_RE)].map(m => ({ m, item: paragraphItem(m[1], m[2], schema) }));
  if (!paras.some(p => p.item)) return { out: region, pairs: [], legacy: false };
  const pairs = [];
  let out = '', last = 0, run = null;
  const flush = () => {
    if (!run) return;
    const ind = lineIndent(region, run.start);
    out += region.slice(last, run.start) + renderList(ind, run.items).replace(/^[ \t]*/, '');
    last = run.end; run = null;
  };
  for (const p of paras) {
    if (!p.item) { flush(); continue; }
    const start = p.m.index, end = start + p.m[0].length;
    if (run && !/^\s*$/.test(region.slice(run.end, start))) flush();
    if (!run) run = { start, end, items: [] };
    run.items.push([p.item[0], `<p>${p.item[1]}</p>`]);
    run.end = end;
    pairs.push([toText(p.item[0]), toText(p.item[1])]);
  }
  flush();
  out += region.slice(last);
  return { out, pairs, legacy: true };
}

// every FAQ region of a page: [start, end] after a FAQ / Common Questions heading
function regions(src) {
  const out = [];
  for (const h of src.matchAll(FAQ_H2_RE)) {
    const a = h.index + h[0].length, b = src.indexOf('</section>', a);
    if (b !== -1) out.push({ kind: 'faq', start: a, end: b });
  }
  for (const h of src.matchAll(CQ_H2_RE)) {
    const a = h.index + h[0].length;
    const next = src.indexOf('<h2', a), sec = src.indexOf('</section>', a);
    const b = [next, sec].filter(x => x !== -1).sort((x, y) => x - y)[0];
    if (b !== undefined) out.push({ kind: 'common', start: a, end: b });
  }
  return out.sort((x, y) => x.start - y.start);
}

function convertPage(src) {
  const schema = schemaQuestions(src);
  const before = [], errors = [];
  let legacy = 0;
  // 1. div.faq-item blocks (homepage, /faq)
  let out = src.replace(A_RE, (whole, ind, q, a) => {
    legacy++;
    before.push([toText(q), toText(a)]);
    return renderItem(ind, q.trim(), a.trim()).replace(/^[ \t]*/, ind).split('\n').map((l, i) => i ? l.slice(4) : l).join('\n');
  });
  // 2. FAQ heading / Common Questions regions, last first so offsets stay valid
  for (const r of regions(out).reverse()) {
    const res = convertRegion(out.slice(r.start, r.end), schema, lineIndent(out, r.start));
    if (res.error) { errors.push(res.error); continue; }
    if (!res.legacy) continue;
    legacy++;
    before.unshift(...res.pairs);
    out = out.slice(0, r.start) + res.out + out.slice(r.end);
  }
  return { out, before, legacy, errors };
}

// drift / malformed items in a page that should already be converted
function problems(src) {
  const bad = [];
  if (/<div class="faq-item">/.test(src)) bad.push('legacy <div class="faq-item"> block');
  const schema = schemaQuestions(src);
  for (const r of regions(src)) {
    const region = src.slice(r.start, r.end);
    if (/<h3\b/.test(region)) bad.push(`<h3> question in a ${r.kind === 'faq' ? 'FAQ' : 'Common Questions'} section (not an accordion item)`);
    for (const m of region.matchAll(P_RE)) if (paragraphItem(m[1], m[2], schema)) bad.push(`legacy question paragraph: "${toText(m[2]).slice(0, 60)}"`);
  }
  const details = (src.match(/<details class="faq-item"/g) || []).length;
  const items = (src.match(ITEM_RE) || []).length;
  if (details !== items) bad.push(`${details} faq-item details but ${items} well-formed (summary.faq-question + div.faq-answer)`);
  if (/<details class="faq-item"[^>]*\bopen\b/.test(src)) bad.push('a faq-item is open on load');
  for (const m of src.matchAll(/<summary class="faq-question">([\s\S]*?)<\/summary>/g)) if (!toText(m[1])) bad.push('empty FAQ question');
  for (const m of src.matchAll(ITEM_RE)) if (!toText(m[2])) bad.push(`empty FAQ answer: "${toText(m[1]).slice(0, 50)}"`);
  return bad;
}

const pages = walk(ROOT, []).sort();
let withFaq = 0, items = 0, changed = 0;
const fails = [];
for (const rel of pages) {
  const file = path.join(ROOT, rel);
  const src = fs.readFileSync(file, 'utf8');
  const bad = problems(src);
  const hasFaq = /<details class="faq-item"/.test(src) || bad.length;
  if (CHECK) {
    if (hasFaq) withFaq++;
    items += (src.match(ITEM_RE) || []).length;
    for (const b of bad) fails.push(`${rel}: ${b}`);
    continue;
  }
  const { out, before, legacy, errors } = convertPage(src);
  for (const e of errors) fails.push(`${rel}: ${e}`);
  if (!legacy) { if (/<details class="faq-item"/.test(src)) { withFaq++; items += (src.match(ITEM_RE) || []).length; } continue; }
  const after = pairsFromItems(out);
  const same = JSON.stringify(after.map(p => p.map(norm))) === JSON.stringify(before.map(p => p.map(norm)));
  if (!same) { fails.push(`${rel}: converted pairs differ from the legacy FAQ text — not written`); continue; }
  const left = problems(out);
  if (left.length) { fails.push(`${rel}: ${left.join('; ')} — not written`); continue; }
  fs.writeFileSync(file, out);
  changed++; withFaq++; items += after.length;
  console.log(`WROTE  ${rel}  (${after.length} question(s))`);
}
console.log(`\nFAQ accordion — ${CHECK ? 'check' : 'propagate'}: ${pages.length} page(s)`);
console.log(`  pages with FAQ       : ${withFaq}`);
console.log(`  questions            : ${items}`);
if (!CHECK) console.log(`  pages converted      : ${changed}`);
for (const f of fails) console.log(`  FAIL  ${f}`);
console.log(`  problems             : ${fails.length}`);
if (fails.length) { console.log('RESULT: FAIL'); process.exit(1); }
console.log('RESULT: PASS');
