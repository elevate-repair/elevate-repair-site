#!/usr/bin/env node
/**
 * Hero offers row and the header booking button — render + drift check.
 *
 *   node tools/apply-hero-offers.mjs           render
 *   node tools/apply-hero-offers.mjs --check   report drift, exit 1 on any
 *
 * The offers row (ported from the Buffalo site, with Denver's own terms) sits in the hero right
 * above the CTA buttons — or under the hero copy where a hero has no buttons — on every page that
 * carries the standard residential terms: the homepage, the five appliance hubs, the 31 brand
 * pages, the 63 city / neighborhood pages and every problem page (Denver, city, brand+problem and
 * the symptom / repair-or-replace guides). Booking, legal, info and thank-you pages never get it.
 *
 *   - the green "$0 Diagnostic with Repair" badge and its condition, in Denver's own words: the $109
 *     service call is credited toward the repair when the customer approves it — so $0 never reads
 *     as a free visit when the repair is declined;
 *   - the callout "Average repair costs less than $300" (an average, not a price cap or guarantee);
 *     on a hub that has a cost section (#repair-cost) it links "See typical repair costs".
 *
 * The desktop header button keeps its Denver destination (/book-online) and reads
 * "Book Online — Save $25" on every page that has it. It is hidden below 769px, where the sticky
 * bottom bar is the booking action (the header has no room for a third control at 320–390px).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, productionPages, pageType, read } from './denver-pages.mjs';

const CHECK = process.argv.includes('--check');
const ELIGIBLE = new Set(['home', 'hub', 'brand', 'city', 'problem-denver', 'problem-brand', 'problem-city', 'subpage', 'guide']);

export const BADGE = '<span class="diag-badge">$0 Diagnostic with Repair</span>';
export const NOTE = '<span class="diag-note">Our $109 service call is credited toward your repair when you approve it.</span>';
const CALLOUT_LABEL = '<span class="avg-callout-label">Average repair costs less than <strong>$300</strong></span>';
const COST_LINK = '<a href="#repair-cost" class="avg-callout-link">See typical repair costs</a>';
const HEADER_OLD = /(<a href="\/book-online" class="header-book-btn">)Book Online(?: &mdash; Save \$25)?(<\/a>)/g;
const HEADER_WANT = '<a href="/book-online" class="header-book-btn">Book Online &mdash; Save $25</a>';

function offers(indent, withLink) {
  const i2 = indent + '    ';
  return `${indent}<div class="hero-offers">\n` +
    `${i2}<p class="diag-offer">${BADGE} ${NOTE}</p>\n` +
    `${i2}<p class="avg-callout">${CALLOUT_LABEL}${withLink ? ' ' + COST_LINK : ''}</p>\n` +
    `${indent}</div>\n`;
}
const OFFERS_RE = /[ \t]*<div class="hero-offers">[\s\S]*?\n[ \t]*<\/div>\n/;

function render(src, rel) {
  let out = src.replace(HEADER_OLD, (_, a, b) => `${a}Book Online &mdash; Save $25${b}`);
  const type = pageType(rel);
  const hero = out.match(/<section class="hero[^"]*"[^>]*>[\s\S]*?<\/section>/);
  if (!hero) return { out, note: 'no hero' };
  let h = hero[0].replace(OFFERS_RE, '');
  if (ELIGIBLE.has(type)) {
    const withLink = type === 'hub' && /id="repair-cost"/.test(out);
    let m;
    if ((m = h.match(/\n([ \t]*)<div class="cta-buttons">/))) {
      h = h.slice(0, m.index + 1) + offers(m[1], withLink) + h.slice(m.index + 1);
    } else if ((m = h.match(/\n([ \t]*)<div class="hero-highlights">[\s\S]*?<\/div>\n/))) {
      const end = m.index + m[0].length;
      h = h.slice(0, end) + offers(m[1], withLink) + h.slice(end);
    } else if ((m = h.match(/\n([ \t]*)<p(?: class="hero-text")?>[\s\S]*?<\/p>\n/))) {
      const end = m.index + m[0].length;
      h = h.slice(0, end) + offers(m[1], withLink) + h.slice(end);
    } else {
      return { out, note: 'no anchor in hero' };
    }
  }
  out = out.replace(hero[0], () => h);
  return { out };
}

const problems = [];
let changed = 0;
for (const rel of productionPages()) {
  if (rel === 'thank-you.html') continue; // conversion page: never touched
  const src = read(rel);
  const { out, note } = render(src, rel);
  const type = pageType(rel);
  const count = (out.match(/<div class="hero-offers">/g) || []).length;
  if (ELIGIBLE.has(type) && count !== 1) problems.push(`${rel}: expected one offers row, ${note || 'found ' + count}`);
  if (!ELIGIBLE.has(type) && count) problems.push(`${rel}: offers row on a ${type} page`);
  if (/class="header-book-btn"/.test(out) && !out.includes(HEADER_WANT)) problems.push(`${rel}: header button drifted`);
  if (out !== src) {
    changed++;
    if (CHECK) problems.push(`${rel}: drift (run node tools/apply-hero-offers.mjs)`);
    else writeFileSync(join(ROOT, rel), out);
  }
}
if (CHECK) {
  if (problems.length) { console.log('FAIL - hero offers / header button:'); problems.slice(0, 80).forEach((p) => console.log('  ' + p)); process.exit(1); }
  console.log('PASS - hero offers row on every residential page, none elsewhere; header button reads "Book Online — Save $25".');
} else {
  problems.forEach((p) => console.log('  ' + p));
  console.log(`apply-hero-offers: ${changed} page(s) updated.`);
}
