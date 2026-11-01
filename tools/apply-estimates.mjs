#!/usr/bin/env node
/**
 * Repair estimates — the estimated-labor card on the five hubs (the Buffalo card, ported exactly)
 * and the "See Our Estimates →" links in every cost table. Render + drift check.
 *
 *   node tools/apply-estimates.mjs           render
 *   node tools/apply-estimates.mjs --check   report drift, exit 1 on any
 *
 * Data: tools/labor-rates.json — the Buffalo labor estimates, which the owner confirmed for Denver
 * (groups, rows, labels and ranges unchanged; only 'publish' rows render) — and
 * tools/denver-estimates.json (hub pages, links, the hub's typical total range).
 *
 *   hubs        the existing "<Appliance> Repair Cost in Denver" H2 gets id="repair-cost" (with
 *               scroll-margin, so a followed link lands with the heading below the sticky header)
 *               and, after the hub's existing cost paragraph (Denver's $109 service call wording),
 *               between <!-- denver-estimates:start --> / end:
 *                 - "Typical total repair cost (parts + labor): $X–$Y" — the TOTAL, its own line
 *                 - the card "Estimated labor cost by repair", "Labor only — parts are quoted
 *                   separately …", group tabs with each group's computed range (ARIA tabs, arrow /
 *                   Home / End keys, every group visible without JS), one table per group with a
 *                   caption and "Repair" / "Estimated labor (parts extra)" headers, price chips,
 *                   the 60-day warranty and "Don't see your repair? Call for a quote."
 *                 - the note "Estimated labor only. Parts are additional. …"
 *               The Buffalo card's Call / Book buttons are not ported: they would add tel links
 *               and click tracking to the hubs, which stay unchanged; the hub's own CTAs remain.
 *   cost tables every row's Service cell links its hub, and the $$ cell carries
 *               "See Our Estimates →" to that hub's #repair-cost (oven and stove / range rows both
 *               go to the oven hub, whose card covers burners, elements and controls)
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, productionPages, read } from './denver-pages.mjs';

const CHECK = process.argv.includes('--check');
const E = JSON.parse(readFileSync(join(ROOT, 'tools', 'denver-estimates.json'), 'utf8'));
const L = JSON.parse(readFileSync(join(ROOT, 'tools', 'labor-rates.json'), 'utf8'));
const GROUP_ORDER = ['controls', 'mechanical', 'teardown'];
const money = (n) => `$${n}`;
const range = (a, b) => `${money(a)}&ndash;${money(b)}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&rsquo;');

/** published groups of one appliance, with their computed ranges */
export function laborGroups(appliance) {
  const rows = L.rows.filter((r) => r.appliance === appliance && r.status === 'publish');
  return GROUP_ORDER.filter((g) => rows.some((r) => r.group === g)).map((g) => {
    const gr = rows.filter((r) => r.group === g);
    return { key: g, name: L.groups[g].name, desc: L.groups[g].desc, rows: gr, low: Math.min(...gr.map((r) => r.low)), high: Math.max(...gr.map((r) => r.high)) };
  });
}
export const laborRow = (appliance, label) => L.rows.find((r) => r.appliance === appliance && r.label === label && r.status === 'publish');

function tabScript(ind) {
  return [
    '<script>',
    '    /* labor-tabs: ARIA tabs for the labor card; every group is visible when JS is off */',
    '    (function(){',
    "        var card=document.querySelector('.labor-card');if(!card)return;",
    "        var tabs=[].slice.call(card.querySelectorAll('[role=\"tab\"]')),panels=[].slice.call(card.querySelectorAll('[role=\"tabpanel\"]'));",
    '        if(tabs.length<2||tabs.length!==panels.length)return;',
    "        card.classList.add('is-tabbed');",
    "        function activate(i,focus){tabs.forEach(function(t,j){var on=j===i;t.setAttribute('aria-selected',on?'true':'false');t.tabIndex=on?0:-1;t.classList.toggle('is-active',on);panels[j].hidden=!on;});if(focus)tabs[i].focus();}",
    '        tabs.forEach(function(t,i){',
    "            t.addEventListener('click',function(){activate(i,false);});",
    "            t.addEventListener('keydown',function(e){var k=e.key,n=null;",
    "                if(k==='ArrowRight'||k==='ArrowDown')n=(i+1)%tabs.length;else if(k==='ArrowLeft'||k==='ArrowUp')n=(i-1+tabs.length)%tabs.length;else if(k==='Home')n=0;else if(k==='End')n=tabs.length-1;",
    '                if(n!==null){e.preventDefault();activate(n,true);}});',
    '        });',
    '        activate(0,false);',
    '    })();',
    '</script>',
  ].map((l) => ind + l).join('\n');
}

function card(key, ind) {
  const h = E.hubs[key];
  const page = L.pages[h.page];
  const groups = laborGroups(page.appliance);
  const out = [];
  out.push('<!-- denver-estimates:start -->');
  out.push('<div class="labor">');
  out.push(`    <p class="estimates-allin"><span class="estimates-allin-label">Typical total repair cost (parts + labor):</span> <strong>${range(...h.total)}</strong></p>`);
  out.push('    <div class="labor-card">');
  out.push('        <div class="labor-head">');
  out.push('            <h3>Estimated labor cost by repair</h3>');
  out.push('            <p class="labor-sub">Labor only &mdash; parts are quoted separately after diagnosis, before any work begins.</p>');
  out.push('        </div>');
  out.push('        <div class="labor-tabs" role="tablist" aria-label="Repair groups">');
  groups.forEach((g, i) => out.push(`            <button type="button" class="labor-tab${i === 0 ? ' is-active' : ''}" role="tab" id="labor-tab-${g.key}" aria-controls="labor-panel-${g.key}" aria-selected="${i === 0 ? 'true' : 'false'}" tabindex="${i === 0 ? '0' : '-1'}"><span class="labor-tab-name">${esc(g.name)}</span><span class="labor-tab-range">${range(g.low, g.high)}</span></button>`));
  out.push('        </div>');
  for (const g of groups) {
    out.push(`        <div class="labor-panel" id="labor-panel-${g.key}" role="tabpanel" aria-labelledby="labor-tab-${g.key}" tabindex="0">`);
    out.push(`            <p class="labor-desc">${esc(g.desc)}</p>`);
    out.push('            <table class="labor-table">');
    out.push(`                <caption><span class="labor-caption">${esc(g.name)} &mdash; estimated labor by repair, ${range(g.low, g.high)}</span></caption>`);
    out.push('                <thead>');
    out.push('                    <tr><th scope="col">Repair</th><th scope="col">Estimated labor (parts extra)</th></tr>');
    out.push('                </thead>');
    out.push('                <tbody>');
    for (const r of g.rows) out.push(`                    <tr><td>${esc(r.label)}</td><td><span class="price-chip">${range(r.low, r.high)}</span></td></tr>`);
    out.push('                </tbody>');
    out.push('            </table>');
    out.push('        </div>');
  }
  out.push('        <div class="labor-foot">');
  out.push('            <p class="labor-trust">60-day parts &amp; labor warranty</p>');
  out.push('            <p class="labor-more">Don&rsquo;t see your repair? Call for a quote.</p>');
  out.push('        </div>');
  out.push('    </div>');
  out.push('    <p class="cost-note labor-note">Estimated labor only. Parts are additional. Your final quote is provided after diagnosis and before any work begins.</p>');
  out.push('</div>');
  return out.map((l) => ind + l).join('\n') + '\n' + tabScript(ind) + '\n' + ind + '<!-- denver-estimates:end -->\n';
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
    const page = L.pages[h.page];
    if (!page) { problems.push(`${k}: ${h.page} missing from tools/labor-rates.json pages`); continue; }
    if (page.allIn.replace(/[–—-]/, '-') !== `$${h.total[0]}-$${h.total[1]}`) problems.push(`${k}: labor-rates allIn ${page.allIn} differs from the hub total`);
    if (!(all[h.page] || '').includes(`between $${h.total[0]} and $${h.total[1]}`)) problems.push(`${k}: total range no longer matches ${h.page}`);
    if (!laborGroups(page.appliance).length) problems.push(`${k}: no published labor rows`);
    // a held (owner-review) row never shows up on any page
    for (const r of L.rows.filter((x) => x.appliance === page.appliance && x.status !== 'publish')) {
      for (const rel of pages) if (all[rel].includes(esc(r.label))) problems.push(`${rel}: held row "${r.label}" is rendered`);
    }
  }
  if (CHECK) {
    if (problems.length) { console.log('FAIL - estimates:'); problems.slice(0, 60).forEach((p) => console.log('  ' + p)); process.exit(1); }
    console.log(`PASS - estimated-labor cards on the five hubs from tools/labor-rates.json (labor only, parts extra; totals labelled); ${tables} cost table(s), ${links} "See Our Estimates" link(s), every anchor exists.`);
  } else {
    problems.forEach((p) => console.log('  ' + p));
    console.log(`apply-estimates: ${changed} page(s) updated.`);
  }
}
