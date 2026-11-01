#!/usr/bin/env node
/**
 * FAQ structured data must describe FAQ content a visitor can actually read.
 *
 *   node tools/sync-faq-schema.js           repair every page that drifted
 *   node tools/sync-faq-schema.js --check   report drift, exit 1 if any
 *
 * A page passes when every FAQPage question AND its full answer appear in the
 * page's visible text. A page that drifted is repaired by the rule that keeps
 * the most content:
 *
 *   - structured visible FAQ (`details.faq-item` disclosures — every FAQ on the
 *     site, see tools/apply-faq-accordion.js — or, on a page not yet converted,
 *     <h3> questions under a "Frequently Asked Questions" heading): the FAQPage
 *     schema is rebuilt from the visible questions and answers, in page order.
 *     Visible copy is not touched.
 *   - problem pages whose "Common Questions About … Issues" section is written
 *     as <strong>Q:</strong> … <strong>A:</strong> … pairs: the schema mirrors
 *     those visible pairs exactly, like a structured FAQ.
 *   - problem pages whose "Common Questions" section is prose only:
 *     a schema question that is already visible as `<p><strong>Q</strong> A</p>`
 *     or `<p>Q A</p>` takes the visible answer; one that is not visible is
 *     added to that section as a `details.faq-item` disclosure (the same
 *     markup every FAQ uses) so the page shows what its schema claims.
 *
 * Run it AFTER any copy change that touches FAQ text. (Shared with the Buffalo
 * site, where it was written; it carries no market-specific rule.) Idempotent.
 * Page set: every .html except tools/, *-repair-denver/, node_modules/, .git/.
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
const toText = (html) => decode(html
  .replace(/<\/?(?:a|strong|em|b|i|span|abbr|small)\b[^>]*>/gi, '')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9$%]+/g, ' ').trim();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function faqBlocks(src) {
  const out = [];
  for (const m of src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data; try { data = JSON.parse(m[1]); } catch (e) { continue; }
    const holder = [];
    const visit = (o, parent, key) => {
      if (Array.isArray(o)) o.forEach((x, i) => visit(x, o, i));
      else if (o && typeof o === 'object') { if ([].concat(o['@type']).includes('FAQPage')) holder.push(o); Object.entries(o).forEach(([k, v]) => visit(v, o, k)); }
    };
    visit(data);
    if (holder.length) out.push({ start: m.index, raw: m[0], json: m[1], data, faqs: holder });
  }
  return out;
}

function visiblePairs(body) {
  const pairs = [];
  for (const m of body.matchAll(/<details class="faq-item">\s*<summary class="faq-question">([\s\S]*?)<\/summary>\s*<div class="faq-answer">([\s\S]*?)<\/div>\s*<\/details>/g)) {
    pairs.push([toText(m[1]), toText(m[2])]);
  }
  if (pairs.length) return { kind: 'faq-item', pairs };
  const sec = body.match(/<h2[^>]*>[^<]*Frequently Asked Questions[^<]*<\/h2>([\s\S]*?)<\/section>/);
  if (sec) {
    for (const m of sec[1].matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|<\/div>\s*<\/div>|$)/g)) {
      const q = toText(m[1]); const a = toText(m[2]);
      if (q.endsWith('?') && a) pairs.push([q, a]);
    }
    if (pairs.length) return { kind: 'h3', pairs };
  }
  // problem pages: "Common Questions About …" written as <strong>Q:</strong> … <strong>A:</strong> … pairs
  const cq = body.match(/<h2>Common Questions About[^<]*<\/h2>([\s\S]*?)(?=<h2|<\/section>)/);
  if (cq) {
    for (const m of cq[1].matchAll(/<p>\s*<strong>Q:<\/strong>([\s\S]*?)<strong>A:<\/strong>([\s\S]*?)<\/p>/g)) {
      const q = toText(m[1]); const a = toText(m[2]);
      if (q && a) pairs.push([q, a]);
    }
    if (pairs.length >= 2) return { kind: 'Q/A', pairs };
  }
  return null;
}

function serialize(block) {
  const pretty = /\n/.test(block.json.trim());
  const json = JSON.stringify(block.data, null, pretty ? 2 : 0).replace(/<\//g, '<\\/');
  return `<script type="application/ld+json">${pretty ? '\n' + json + '\n' : json}</script>`;
}

function syncPage(rel) {
  const file = path.join(ROOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  const blocks = faqBlocks(src);
  if (!blocks.length) return null;
  const bodyOf = (s) => (s.match(/<body\b[\s\S]*<\/body>/i) || [''])[0].replace(/<script\b[\s\S]*?<\/script>/gi, ' ');
  const visible = () => norm(toText(bodyOf(src)));
  const drift = () => {
    const vis = visible(); const bad = [];
    for (const b of faqBlocks(src)) for (const f of b.faqs) for (const q of [].concat(f.mainEntity || [])) {
      const qt = norm(q.name || ''), at = norm((q.acceptedAnswer && q.acceptedAnswer.text) || '');
      if (!qt || !vis.includes(qt)) bad.push(`question not visible: ${q.name}`);
      else if (!at || !vis.includes(at)) bad.push(`answer not visible: ${q.name}`);
    }
    return bad;
  };
  const before = drift();
  const body = bodyOf(src);
  const vp = visiblePairs(body);
  // structured visible FAQ: the schema mirrors it exactly, not just loosely
  const current = blocks.flatMap(b => b.faqs.flatMap(f => [].concat(f.mainEntity || []).map(q => [q.name, q.acceptedAnswer && q.acceptedAnswer.text])));
  const exact = vp && JSON.stringify(current) === JSON.stringify(vp.pairs);
  if (CHECK) return { rel, drift: before.length ? before : (vp && !exact ? ['schema text differs from the visible FAQ (run the sync)'] : []), action: null };
  if (!before.length && (!vp || exact)) return { rel, drift: [], action: null };

  let action;
  if (vp) {
    for (const b of blocks) for (const f of b.faqs) {
      f.mainEntity = vp.pairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }));
    }
    for (const b of blocks.slice().reverse()) src = src.slice(0, b.start) + serialize(b) + src.slice(b.start + b.raw.length);
    action = `schema rebuilt from ${vp.pairs.length} visible ${vp.kind} Q&A`;
  } else {
    const h = src.match(/<h2>Common Questions About[^<]*<\/h2>/);
    if (!h) return { rel, drift: before, action: 'ERROR: no visible FAQ section to anchor to' };
    const sectionOf = (s) => { const m = s.match(/<h2>Common Questions About[^<]*<\/h2>/); const a = m.index + m[0].length; return [a, s.indexOf('<h2', a)]; };
    let [a0, b0] = sectionOf(src);
    const paras = [...src.slice(a0, b0).matchAll(/<p>([\s\S]*?)<\/p>/g)].map(p => toText(p[1]));
    const added = []; let fixedAnswers = 0;
    for (const b of blocks) for (const f of b.faqs) for (const q of [].concat(f.mainEntity || [])) {
      const qt = norm(q.name);
      const para = paras.find(t => norm(t).startsWith(qt));
      if (para) {
        const ans = para.slice(para.indexOf('?') + 1).trim();
        if (ans && norm(ans) !== norm(q.acceptedAnswer.text)) { q.acceptedAnswer.text = ans; fixedAnswers++; }
        continue;
      }
      added.push(`<details class="faq-item">\n<summary class="faq-question">${esc(q.name)}</summary>\n<div class="faq-answer"><p>${esc(q.acceptedAnswer.text)}</p></div>\n</details>`);
    }
    if (fixedAnswers) for (const b of blocks.slice().reverse()) src = src.slice(0, b.start) + serialize(b) + src.slice(b.start + b.raw.length);
    if (added.length) {
      [a0, b0] = sectionOf(src);
      let section = src.slice(a0, b0);
      // keep a photo that closes the section after the new answers
      const trail = section.match(/(\s*<img\b[^>]*>\s*)$/);
      const head = (trail ? section.slice(0, trail.index) : section).replace(/\s*$/, '');
      section = head + '\n' + added.join('\n') + (trail ? trail[1] : '\n');
      src = src.slice(0, a0) + section + src.slice(b0);
    }
    action = `${added.length} schema Q&A shown in "Common Questions"${fixedAnswers ? `, ${fixedAnswers} schema answer(s) synced to visible` : ''}`;
  }
  fs.writeFileSync(file, src);
  const after = drift();
  return { rel, drift: after, action, before: before.length };
}

const results = walk(ROOT, []).sort().map(syncPage).filter(Boolean);
console.log(`FAQ schema vs visible content — ${CHECK ? 'check' : 'sync'}: ${results.length} page(s) with FAQPage`);
let fail = 0;
for (const r of results) {
  if (r.action) console.log(`  ${r.action.startsWith('ERROR') ? 'FAIL ' : 'fixed'} ${r.rel}: ${r.action}`);
  if (r.drift.length) { fail++; for (const d of r.drift) console.log(`  FAIL  ${r.rel}: ${d}`); }
}
console.log(`  pages drifting      : ${fail}`);
if (fail) { console.log('RESULT: FAIL'); process.exit(1); }
console.log('RESULT: PASS');
