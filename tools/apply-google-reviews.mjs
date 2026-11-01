#!/usr/bin/env node
/**
 * Google reviews — every reviews block on the Denver pages, rendered from tools/denver-reviews.json.
 * Render + drift check.
 *
 *   node tools/apply-google-reviews.mjs           render
 *   node tools/apply-google-reviews.mjs --check   report drift, exit 1 on any
 *
 * Every existing reviews block (the "What … Customers Are Saying" section on the homepage and the
 * 63 city / neighborhood pages — the section that holds `.reviews-grid`) shows, between
 * <!-- google-reviews:start --> / end:
 *
 *   - one card per featured review, in the JSON's order: the author's exact name, the stars of that
 *     review, the full original text (verbatim — paragraph breaks and spacing kept, never shortened)
 *     and "Read on Google" to that review;
 *   - "See All Google Reviews →" to the profile's Reviews tab.
 *
 * External links open in a new tab (target="_blank" rel="noopener"). Nothing Google does not show is
 * added: no author city, appliance, result or date, and no aggregate rating or review count.
 *
 * Retired everywhere: the old placeholder cards (Olga O., Mark L., Sarah K., David M.), the
 * "Rated 4.9 ★ average • 94+ reviews" line, and every AggregateRating / Review in the JSON-LD (the
 * rest of each schema block is kept as it is). No rating schema is ever added.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, productionPages, read } from './denver-pages.mjs';

const CHECK = process.argv.includes('--check');
const DATA = JSON.parse(readFileSync(join(ROOT, 'tools', 'denver-reviews.json'), 'utf8'));
const START = '<!-- google-reviews:start -->';
const END = '<!-- google-reviews:end -->';
const RETIRED = ['Olga O.', 'Mark L.', 'Sarah K.', 'David M.', 'Rated 4.9', '94+ reviews'];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function block(ind) {
  const i2 = ind + '    ', i3 = ind + '        ', i4 = ind + '            ';
  const cards = DATA.reviews.filter((r) => r.featured).map((r) => [
    `${i3}<div class="review-card-static">`,
    `${i4}<div class="review-stars" role="img" aria-label="${r.rating} out of 5 stars">${'&#9733;'.repeat(r.rating)}</div>`,
    // verbatim text: newlines and spaces kept (white-space: pre-wrap), nothing else between the tags
    `${i4}<div class="review-text">${esc(r.text)}</div>`,
    `${i4}<div class="review-meta"><span><strong>${esc(r.author)}</strong></span><span><a href="${esc(r.reviewUrl)}" target="_blank" rel="noopener">Read on Google</a></span></div>`,
    `${i3}</div>`,
  ].join('\n')).join('\n');
  return `${ind}${START}\n${ind}<div class="google-reviews">\n${i2}<div class="reviews-grid reviews-grid--google">\n${cards}\n${i2}</div>\n` +
    `${i2}<p class="google-reviews-more"><a href="${esc(DATA.reviewsTabUrl)}" target="_blank" rel="noopener">See All Google Reviews &rarr;</a></p>\n` +
    `${ind}</div>\n${ind}${END}`;
}

/** JSON-LD without AggregateRating / Review, re-serialized only when something was removed */
function stripRatingSchema(src) {
  let removed = 0;
  const out = src.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (m, a, body, z) => {
    if (!/"aggregateRating"|"AggregateRating"|"@type":\s*"Review"|"review"\s*:/.test(body)) return m;
    // remove the property blocks in place so the rest of the block keeps its own formatting
    let b = body.replace(/,\s*\n(\s*)"aggregateRating":\s*\{[^{}]*\}/g, () => { removed++; return ''; })
      .replace(/\n(\s*)"aggregateRating":\s*\{[^{}]*\},/g, () => { removed++; return ''; });
    b = b.replace(/,\s*\n\s*"review":\s*\[[\s\S]*?\n\s*\]/g, () => { removed++; return ''; });
    JSON.parse(b); // must stay valid
    return a + b + z;
  });
  return { out, removed };
}

export function renderPage(src) {
  let { out } = stripRatingSchema(src);
  out = out.replace(/\n[ \t]*<p class="section-intro">Rated 4\.9 &#9733; average &bull; 94\+ reviews across the Denver metro\.<\/p>/g, '');
  // the reviews grid (legacy) or the managed block → the managed block
  const managed = new RegExp(`([ \\t]*)${START}[\\s\\S]*?${END}`);
  if (managed.test(out)) return out.replace(managed, (m, ind) => block(ind));
  const at = out.indexOf('<div class="reviews-grid">');
  if (at < 0) return out;
  const lineStart = out.lastIndexOf('\n', at) + 1;
  const ind = out.slice(lineStart, at);
  // the legacy grid ends at its balanced </div>
  let depth = 0, end = -1;
  for (const m of out.slice(at).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) { end = at + m.index + 6; break; }
  }
  return out.slice(0, lineStart) + block(ind) + out.slice(end);
}

const isMain = process.argv[1] && process.argv[1].endsWith('apply-google-reviews.mjs');
if (isMain) {
  const problems = [];
  let changed = 0, blocks = 0;
  const featured = DATA.reviews.filter((r) => r.featured);
  for (const rel of productionPages()) {
    if (rel === 'thank-you.html') continue;
    const src = read(rel);
    const out = renderPage(src);
    const visible = out.replace(/<script[\s\S]*?<\/script>/g, '');
    for (const t of RETIRED) if (visible.includes(t) || out.includes(t)) problems.push(`${rel}: retired "${t}" still present`);
    if (/"aggregateRating"|AggregateRating|"@type":\s*"Review"/.test(out)) problems.push(`${rel}: rating schema present`);
    if (/class="reviews-grid"/.test(out)) problems.push(`${rel}: legacy reviews grid left`);
    if (out.includes(START)) {
      blocks++;
      const b = out.slice(out.indexOf(START), out.indexOf(END));
      const cards = [...b.matchAll(/<div class="review-text">([\s\S]*?)<\/div>[\s\S]*?<strong>([^<]+)<\/strong><\/span><span><a href="([^"]+)" target="_blank" rel="noopener">Read on Google<\/a>/g)];
      if (cards.length !== featured.length) problems.push(`${rel}: ${cards.length} review cards, expected ${featured.length}`);
      cards.forEach((c, i) => {
        const r = featured[i];
        if (!r || c[1] !== esc(r.text) || c[2] !== esc(r.author) || c[3] !== esc(r.reviewUrl)) problems.push(`${rel}: card ${i + 1} differs from tools/denver-reviews.json`);
      });
      if (!b.includes(`href="${esc(DATA.reviewsTabUrl)}" target="_blank" rel="noopener">See All Google Reviews`)) problems.push(`${rel}: See All Google Reviews link missing`);
      if (/\b(5\.0|\d+ reviews|reviewCount)\b/.test(b)) problems.push(`${rel}: aggregate rating or count in the block`);
    }
    if (out !== src) {
      changed++;
      if (CHECK) problems.push(`${rel}: drift (run node tools/apply-google-reviews.mjs)`);
      else writeFileSync(join(ROOT, rel), out);
    }
  }
  const css = read('styles.css');
  if (!/\.reviews-grid--google\b/.test(css) || !/white-space:\s*pre-wrap/.test(css)) problems.push('styles.css: Google reviews styles missing');
  if (CHECK) {
    if (problems.length) { console.log('FAIL - Google reviews:'); problems.slice(0, 80).forEach((p) => console.log('  ' + p)); process.exit(1); }
    console.log(`PASS - ${blocks} reviews block(s) match tools/denver-reviews.json (${featured.length} verbatim reviews each); no placeholder card, aggregate line or rating schema anywhere.`);
  } else {
    problems.forEach((p) => console.log('  ' + p));
    console.log(`apply-google-reviews: ${changed} page(s) updated, ${blocks} reviews block(s).`);
  }
}
