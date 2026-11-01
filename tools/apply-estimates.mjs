#!/usr/bin/env node
/**
 * Repair estimates — the cost card on the five hubs and the "See Our Estimates →" links in every
 * cost table. Render + drift check.
 *
 *   node tools/apply-estimates.mjs           render
 *   node tools/apply-estimates.mjs --check   report drift, exit 1 on any
 *
 * Source of truth: tools/denver-estimates.json — only prices the Denver site already publishes (the
 * hub's own total range and the per-repair ranges stated on Denver problem pages), always labelled
 * as typical total repair cost (parts and labor). No price is invented: a hub without published
 * per-repair prices shows the total range, the service call and the warranty, but no table.
 *
 *   hubs        the existing "<Appliance> Repair Cost in Denver" H2 gets id="repair-cost" (with
 *               scroll-margin so a followed link lands below the sticky header, heading and table
 *               in view) and the card follows the existing cost paragraph, between
 *               <!-- denver-estimates:start --> / end markers
 *   cost tables every row's Service cell links its hub, and the $$ cell carries
 *               "See Our Estimates →" to that hub's #repair-cost (oven and stove / range rows both
 *               go to the oven hub, whose card covers burners, igniters and temperature controls)
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, productionPages, read, GUIDE_DIRS } from './denver-pages.mjs';

const CHECK = process.argv.includes('--check');
const E = JSON.parse(readFileSync(join(ROOT, 'tools', 'denver-estimates.json'), 'utf8'));
const money = (n) => `$${n}`;
const range = (a, b) => `${money(a)}&ndash;${money(b)}`;
const GUIDE_FILES = {
  fridge: 'fridge-repair/repair-or-replace-refrigerator', washer: 'washer-repair/repair-or-replace-washer',
  dryer: 'dryer-repair/repair-or-replace-dryer', dishwasher: 'dishwasher-repair/repair-or-replace-dishwasher',
  oven: 'oven-repair/repair-or-replace-oven-stove-range',
};

function card(key, ind) {
  const h = E.hubs[key];
  const i2 = ind + '    ', i3 = ind + '        ';
  const rows = h.rows.map((r) => `${i3}<tr><td>${r.label}</td><td><span class="price-chip">${range(r.low, r.high)}</span></td></tr>`).join('\n');
  const table = h.rows.length ? `${i2}<table class="estimates-table">\n${i3}<caption>Typical cost by repair (parts and labor)</caption>\n` +
    `${i3}<thead><tr><th scope="col">Repair</th><th scope="col">Typical cost</th></tr></thead>\n${i3}<tbody>\n${rows.replace(/^/gm, '    ')}\n${i3}</tbody>\n${i2}</table>\n` : '';
  const guide = existsSync(join(ROOT, GUIDE_FILES[key] + '.html'))
    ? `${i2}<p class="estimates-guide"><a href="/${GUIDE_FILES[key]}">Repair or replace? Read our ${h.name} guide &rarr;</a></p>\n` : '';
  return `${ind}<!-- denver-estimates:start -->\n${ind}<div class="repair-estimates">\n` +
    `${i2}<h3>Typical repair costs</h3>\n` +
    `${i2}<p class="estimates-allin"><span class="estimates-allin-label">Typical total repair cost (parts + labor):</span> <strong>${range(...h.total)}</strong></p>\n` +
    table +
    `${i2}<p class="estimates-service">Our $${E.serviceCall} service call covers the visit and diagnosis and is credited toward your repair when you approve it.</p>\n` +
    `${i2}<p class="estimates-trust">60-day parts &amp; labor warranty</p>\n` +
    `${i2}<p class="estimates-note">Your exact price is quoted after diagnosis, before any work starts. Don't see your repair? Ask us for a quote.</p>\n` +
    guide +
    `${ind}</div>\n${ind}<!-- denver-estimates:end -->\n`;
}

const MARKED = /[ \t]*<!-- denver-estimates:start -->[\s\S]*?<!-- denver-estimates:end -->\n/;

export function renderPage(src, rel) {
  let out = src;
  const hubKey = Object.keys(E.hubs).find((k) => E.hubs[k].page === rel);
  if (hubKey) {
    out = out.replace(MARKED, '');
    out = out.replace(/<h2(?: id="repair-cost")?>([A-Za-z ,&;]+ Repair Cost in Denver)<\/h2>/, '<h2 id="repair-cost">$1</h2>');
    const m = out.match(/\n([ \t]*)<p>Most [a-z]+ repairs in Denver cost between[\s\S]*?<\/p>\n/);
    if (!m) throw new Error(`${rel}: cost paragraph not found`);
    const at = m.index + m[0].length;
    out = out.slice(0, at) + card(hubKey, m[1]) + out.slice(at);
  }
  // cost tables: link each row to its hub and its estimates
  out = out.replace(/<tr><td>(?:<a href="[^"]*" class="cost-link">)?([^<]+?)(?:<\/a>)?<\/td><td>(?:<span class="cost-level">)?(\$+)(?:<\/span>)?(?: <a href="[^"]*" class="cost-estimate-link">See Our Estimates &rarr;<\/a>)?<\/td><\/tr>/g, (m, svc, level) => {
    const key = E.costTableRows[svc.trim()];
    if (!key) return m;
    const href = E.hubs[key].href;
    return `<tr><td><a href="${href}" class="cost-link">${svc}</a></td><td><span class="cost-level">${level}</span> <a href="${href}#repair-cost" class="cost-estimate-link">See Our Estimates &rarr;</a></td></tr>`;
  });
  return out;
}

const isMain = process.argv[1] && process.argv[1].endsWith('apply-estimates.mjs');
if (isMain) {
  const problems = [];
  let changed = 0, tables = 0, links = 0;
  const pages = productionPages();
  const all = Object.fromEntries(pages.map((p) => [p, read(p)]));
  for (const rel of pages) {
    if (rel === 'thank-you.html') continue;
    const src = all[rel];
    const out = renderPage(src, rel);
    if (/class="cost-table"/.test(out)) tables++;
    for (const m of out.matchAll(/class="cost-estimate-link"/g)) links++;
    for (const m of out.matchAll(/<tr><td>([^<]*)<\/td><td>\$+<\/td><\/tr>/g)) problems.push(`${rel}: cost row without a link: ${m[1]}`);
    // every estimates link points at an existing anchor
    for (const m of out.matchAll(/href="\/([a-z-]+)#repair-cost"/g)) {
      const target = renderPage(all[m[1] + '.html'] || '', m[1] + '.html');
      if (!/<h2 id="repair-cost">/.test(target)) problems.push(`${rel}: #repair-cost missing on /${m[1]}`);
    }
    if (out !== src) {
      changed++;
      if (CHECK) problems.push(`${rel}: drift (run node tools/apply-estimates.mjs)`);
      else writeFileSync(join(ROOT, rel), out);
    }
  }
  for (const [k, h] of Object.entries(E.hubs)) {
    for (const r of h.rows) {
      const srcPage = all[r.source.slice(1) + '.html'] || '';
      const visible = srcPage.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
      if (!visible.includes(`$${r.low}–$${r.high}`) && !visible.includes(`$${r.low}&ndash;$${r.high}`)) problems.push(`${k}: ${r.label} $${r.low}–$${r.high} is not published on ${r.source}`);
    }
    if (!(all[h.page] || '').includes(`between $${h.total[0]} and $${h.total[1]}`)) problems.push(`${k}: total range no longer matches ${h.page}`);
  }
  if (CHECK) {
    if (problems.length) { console.log('FAIL - estimates:'); problems.slice(0, 60).forEach((p) => console.log('  ' + p)); process.exit(1); }
    console.log(`PASS - estimates cards on the five hubs from published Denver prices only; ${tables} cost table(s), ${links} "See Our Estimates" link(s), every anchor exists.`);
  } else {
    problems.forEach((p) => console.log('  ' + p));
    console.log(`apply-estimates: ${changed} page(s) updated.`);
  }
}
