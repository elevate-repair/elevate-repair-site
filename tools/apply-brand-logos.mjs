#!/usr/bin/env node
/**
 * Brand logos — the logo above the visible brand name in every content block of brand links, and a
 * logo chip before the H1 of the brand's own page. Render + drift check.
 *
 *   node tools/apply-brand-logos.mjs           render
 *   node tools/apply-brand-logos.mjs --check   report drift, exit 1 on any
 *
 * A brand block is any content container whose links all go to Denver brand pages, whatever its
 * heading or class: the homepage "All Major Brands" grid, the /brands directory, "Brands We Repair"
 * on the five hubs and "Other Brands We Service" on the brand, city, problem and symptom-guide
 * pages. In every block each link becomes a pill with the logo (decorative, aria-hidden) above the
 * visible name; the set of brands, their order, link targets and names never change. Brands without
 * an official logo file (Beko, Hisense, Insignia, Speed Queen) keep a text pill. The nav, footer and
 * brand names inside sentences stay text.
 *
 * Logos: tools/denver-images.json (uploaded 172x65 originals → EXIF-free WebP at native size, never
 * cropped, stretched or upscaled). A logo never creates a brand page or a service claim.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, productionPages, pageType, pageBrand, read, balancedDivEnd, BRANDS } from './denver-pages.mjs';

const CHECK = process.argv.includes('--check');
const BY_HREF = new Map(Object.entries(BRANDS).map(([slug, b]) => [b.page, { slug, ...b }]));

function pill(href, name, attrs) {
  const b = BY_HREF.get(href);
  const style = attrs.style ? ` style="${attrs.style}"` : '';
  if (b && b.status === 'use') {
    return `<a href="${href}" class="brand-tag brand-tag--logo"${style}><img src="/${b.out}" alt="" aria-hidden="true" width="172" height="65" loading="lazy" decoding="async"><span>${name}</span></a>`;
  }
  return `<a href="${href}" class="brand-tag"${style}>${name}</a>`;
}

const LINK_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
function linkAttrs(s) {
  return { href: (s.match(/href="([^"]+)"/) || [])[1], style: (s.match(/style="([^"]*)"/) || [])[1] };
}
const linkName = (inner) => inner.replace(/<img\b[^>]*>/g, '').replace(/<\/?span>/g, '').trim();

/** rewrite every leaf container whose links are all brand pages */
export function renderPage(src, rel) {
  let out = src;
  let blocks = 0;
  const re = /<div\b([^>]*)>/g;
  for (let m; (m = re.exec(out));) {
    const end = balancedDivEnd(out, m.index);
    if (end < 0) continue;
    const inner = out.slice(m.index + m[0].length, end - 6);
    if (/<div\b/.test(inner)) continue; // leaf containers only
    const links = [...inner.matchAll(LINK_RE)];
    if (links.length < 2) continue;
    if (!links.every((l) => BY_HREF.has(linkAttrs(l[1]).href))) continue;
    if (inner.replace(LINK_RE, '').replace(/<!--[\s\S]*?-->/g, '').trim() !== '') continue; // only links inside (never prose)
    const comments = [...inner.matchAll(/<!--[\s\S]*?-->/g)].map((c) => c[0]);
    const cls = (m[1].match(/class="([^"]*)"/) || [])[1] || '';
    const ind = (inner.match(/\n([ \t]*)<a/) || [])[1] || '                ';
    const close = (inner.match(/\n([ \t]*)$/) || [])[1] || '            ';
    const pills = links.map((l) => ind + pill(linkAttrs(l[1]).href, linkName(l[2]), linkAttrs(l[1]))).join('\n');
    const open = /\bbrands-grid\b/.test(cls) && !/brands-grid--related/.test(cls) ? `<div class="${cls}">` : '<div class="brands-grid brands-grid--related">';
    const rebuilt = `${open}\n${comments.map((c) => ind + c + '\n').join('')}${pills}\n${close}</div>`;
    out = out.slice(0, m.index) + rebuilt + out.slice(end);
    re.lastIndex = m.index + rebuilt.length;
    blocks++;
  }
  // hero chip on the brand's own page
  const slug = pageType(rel) === 'brand' ? pageBrand(rel) : null;
  out = out.replace(/[ \t]*<div class="brand-hero-logo">[^\n]*<\/div>\n/, '');
  if (slug && BRANDS[slug].status === 'use') {
    const b = BRANDS[slug];
    out = out.replace(/(<section class="hero[^"]*"[^>]*>\s*<div class="container">\n)([ \t]*)(<h1)/, (_, a, ind, h1) =>
      `${a}${ind}<div class="brand-hero-logo"><img src="/${b.out}" alt="${b.name.replace(/&/g, '&amp;')} logo" width="172" height="65" decoding="async"></div>\n${ind}${h1}`);
  }
  return { out, blocks };
}

const isMain = process.argv[1] && process.argv[1].endsWith('apply-brand-logos.mjs');
if (isMain) {
  const problems = [];
  let changed = 0, blocks = 0, pills = 0, chips = 0;
  for (const rel of productionPages()) {
    if (rel === 'thank-you.html') continue;
    const src = read(rel);
    const r = renderPage(src, rel);
    blocks += r.blocks;
    pills += (r.out.match(/class="brand-tag brand-tag--logo"/g) || []).length;
    chips += (r.out.match(/class="brand-hero-logo"/g) || []).length;
    // a logo only ever sits on its own brand's pill / page
    for (const m of r.out.matchAll(/<a href="([^"]+)" class="brand-tag brand-tag--logo"[^>]*><img src="\/assets\/images\/brands\/([a-z-]+)\.webp"/g)) {
      const b = BY_HREF.get(m[1]);
      if (!b || b.slug !== m[2]) problems.push(`${rel}: ${m[2]} logo on the ${m[1]} pill`);
    }
    const chip = r.out.match(/<div class="brand-hero-logo"><img src="\/assets\/images\/brands\/([a-z-]+)\.webp"/);
    if (chip && chip[1] !== pageBrand(rel)) problems.push(`${rel}: ${chip[1]} chip on another brand's page`);
    if (/<div class="cities-grid"[^>]*>\s*<a href="\/(?:[a-z-]+-appliance-repair-denver|asko|beko|bertazzoni|bluestar|dacor|fisher-paykel|gaggenau|haier|hisense|hotpoint|insignia|jenn-air|magic-chef|speed-queen|thermador|wolf)"/.test(r.out)) problems.push(`${rel}: brand block still uses the text city-link markup`);
    if (r.out !== src) {
      changed++;
      if (CHECK) problems.push(`${rel}: drift (run node tools/apply-brand-logos.mjs)`);
      else writeFileSync(join(ROOT, rel), r.out);
    }
  }
  const css = read('styles.css');
  for (const sel of ['.brand-tag--logo', '.brand-hero-logo', '.brands-grid--related']) if (!css.includes(sel)) problems.push(`styles.css: missing ${sel}`);
  const summary = `${blocks} brand block(s), ${pills} logo pill(s), ${chips} hero chip(s)`;
  if (CHECK) {
    if (problems.length) { console.log('FAIL - brand logos:'); problems.slice(0, 80).forEach((p) => console.log('  ' + p)); process.exit(1); }
    console.log(`PASS - ${summary}; every logo sits on its own brand.`);
  } else {
    problems.forEach((p) => console.log('  ' + p));
    console.log(`apply-brand-logos: ${changed} page(s) updated; ${summary}.`);
  }
}
