#!/usr/bin/env node
/**
 * Natural headings — no mechanical repeat of the page's place in H2 / H3 and the sentence right
 * under it. Render + drift check.
 *
 *   node tools/apply-natural-headings.mjs           rewrite the retired templates
 *   node tools/apply-natural-headings.mjs --check   fail if any retired template is back
 *
 * Once the H1 (and the title) name the place, these section headings do not repeat it (the
 * place is the page's own: the city of a city / city+problem page, Denver everywhere else):
 *
 *   Our Dishwasher Repair Process in Arvada            → Our Dishwasher Repair Process
 *   Why Your Dishwasher Is Leaking Water in Arvada     → Why Your Dishwasher Is Leaking Water
 *   Why Your Refrigerator Is Ice Maker Not Working …   → Why Your Refrigerator Ice Maker Is Not Working
 *   Appliance Services in Arvada                       → Our Appliance Repair Services
 *   Frequently Asked Questions — Appliance Repair in … → Frequently Asked Questions
 *   Appliance Brands We Service in Arvada              → Appliance Brands We Service
 *   Schedule Appliance / Bosch / Refrigerator Repair in … → Schedule … Repair
 *   Bosch Repair in Denver — Common Issues             → Common Bosch Repair Issues
 *   Our Appliance Repair Services in Denver            → Our Appliance Repair Services
 *   Refrigerator Repair in Denver (service H3s)        → Refrigerator Repair
 *
 * and a paragraph that opens "In <place>, Elevate Repair has become …" right under a heading that
 * already names the place starts at "Elevate Repair has become …".
 *
 * Kept on purpose: titles, H1s, meta, URLs, canonicals, every FAQ question, the navigational
 * headings that say where links go ("Other … Problems We Fix in …", "Common Appliance Issues We
 * Fix in …", "Appliance Repair Near …", "Related … Issues in …"), the local-content headings
 * ("… Repair Considerations for <City> Homes", "Why <City> Residents Trust Elevate Repair"), the
 * booking / CTA headings ("Broken Appliance in <City>? …", "Need Appliance Repair in <City>?") and
 * the cost headings. Nothing here promises rankings stay unchanged.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, productionPages, pageType, read, CITIES } from './denver-pages.mjs';

const CHECK = process.argv.includes('--check');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function place(rel) {
  const t = pageType(rel);
  if (t === 'city') return CITIES.find((c) => c.slug + '.html' === rel).name;
  if (t === 'problem-city') return CITIES.filter((c) => rel.startsWith(c.slug + '-')).sort((a, b) => b.slug.length - a.slug.length)[0].name;
  return 'Denver';
}

function rules(p) {
  const P = `${esc(p)}(?:, CO)?`;
  return [
    [new RegExp(`^Our (.+?) Repair Process in ${P}$`), 'Our $1 Repair Process'],
    [new RegExp(`^Why Your (Refrigerator|Washer|Dryer|Dishwasher|Oven) Is (Ice Maker|Water Dispenser|Freezer) (.+?) in ${P}$`), 'Why Your $1 $2 Is $3'],
    [new RegExp(`^Why Your (.+?) Is (.+?) in ${P}$`), 'Why Your $1 Is $2'],
    [new RegExp(`^Appliance Services in ${P}$`), 'Our Appliance Repair Services'],
    [new RegExp(`^Frequently Asked Questions (?:&mdash;|—) Appliance Repair in ${P}$`), 'Frequently Asked Questions'],
    [new RegExp(`^Appliance Brands We Service in ${P}$`), 'Appliance Brands We Service'],
    [new RegExp(`^Schedule (.+?) Repair in ${P}$`), 'Schedule $1 Repair'],
    [new RegExp(`^(.+?) Repair in ${P} (?:&mdash;|—) Common Issues$`), 'Common $1 Repair Issues'],
    [new RegExp(`^Our Appliance Repair Services in ${P}$`), 'Our Appliance Repair Services'],
    [new RegExp(`^(Refrigerator|Washer|Dryer|Dishwasher|Oven|Stove &amp; Range) Repair in ${P}$`), '$1 Repair'],
  ];
}

export function renderPage(src, rel) {
  const p = place(rel);
  const R = rules(p);
  let out = src.replace(/<(h[23])(\b[^>]*)>([^<]+)<\/\1>/g, (m, tag, attrs, inner) => {
    const t = inner.trim();
    for (const [re, to] of R) if (re.test(t)) return `<${tag}${attrs}>${inner.replace(t, t.replace(re, to))}</${tag}>`;
    return m;
  });
  // "In <place>, Elevate Repair has become …" right under a heading that names the place
  out = out.replace(new RegExp(`(<h[23][^>]*>[^<]*\\b${esc(p)}\\b[^<]*</h[23]>\\s*<p>)In ${esc(p)}(?:, CO)?, Elevate Repair has become`, 'g'), '$1Elevate Repair has become');
  return out;
}

const isMain = process.argv[1] && process.argv[1].endsWith('apply-natural-headings.mjs');
if (isMain) {
  const problems = [];
  let changed = 0, headings = 0;
  for (const rel of productionPages()) {
    if (rel === 'thank-you.html') continue;
    const src = read(rel);
    const out = renderPage(src, rel);
    const before = [...src.matchAll(/<h[23]\b[^>]*>([^<]+)<\/h[23]>/g)].map((m) => m[1]);
    const after = [...out.matchAll(/<h[23]\b[^>]*>([^<]+)<\/h[23]>/g)].map((m) => m[1]);
    headings += before.filter((h, i) => h !== after[i]).length;
    if (out !== src) {
      changed++;
      if (CHECK) problems.push(`${rel}: retired heading template (run node tools/apply-natural-headings.mjs)`);
      else writeFileSync(join(ROOT, rel), out);
    }
  }
  if (CHECK) {
    if (problems.length) { console.log('FAIL - natural headings:'); problems.slice(0, 60).forEach((p) => console.log('  ' + p)); process.exit(1); }
    console.log('PASS - no section heading or lead sentence repeats the page\'s place mechanically.');
  } else console.log(`apply-natural-headings: ${changed} page(s) updated, ${headings} heading(s) rewritten.`);
}
