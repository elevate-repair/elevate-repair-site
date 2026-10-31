#!/usr/bin/env node
/**
 * "Recent Appliance Repairs" — four job photos in a static 2 x 2 grid, right after the appliance
 * strip; on the homepage the coupon tickets follow immediately. Render + drift check.
 *
 *   node tools/apply-gallery.mjs           render
 *   node tools/apply-gallery.mjs --check   report drift, exit 1 on any
 *
 * A gallery is only kept where one already existed (the homepage and the 63 city pages); it is
 * never added to a booking, legal or info page. Every gallery:
 *
 *   - shows exactly four photos from tools/denver-images.json, one per appliance family, never the
 *     same shot twice (the homepage set is fixed; city pages rotate through the catalogue so
 *     sibling pages do not all show the same four);
 *   - uses only photos with status "use" — never the retired ones (the two refrigerators with
 *     children's portraits on the door, the washer photo that was published as a dryer, the range
 *     hood) — through their EXIF-free 4:3 tile exports;
 *   - carries short captions that say what the photo shows and never name a city: the place of
 *     each job is not recorded, so no photo is presented as a Denver job;
 *   - has no carousel, arrows or autoscroll (the homepage's click-to-enlarge modal stays).
 *
 * Placement: the gallery section follows the section that holds the appliance strip; on the
 * homepage the strip's section ends right after the strip, the gallery and the "Current Specials"
 * coupon section follow, and the service descriptions continue in their own section.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, productionPages, pageType, read } from './denver-pages.mjs';

const CHECK = process.argv.includes('--check');
const cat = JSON.parse(readFileSync(join(ROOT, 'tools', 'denver-images.json'), 'utf8'));
const HEADING = 'Recent Appliance Repairs';
const INTRO = 'A few photos from real appliance repair jobs.';
const HOME_SET = ['washer-drum-open', 'dryer-top-removed', 'fridge-compressor', 'tech-cooktop-repair'];
const POOLS = {
  washer: ['washer-drum-open', 'top-load-washer', 'lg-stacked-laundry'],
  dryer: ['dryer-top-removed', 'terminal-block-burnt'],
  fridge: ['fridge-compressor', 'customer-fridge-french'],
  cooking: ['tech-cooktop-repair', 'wall-oven-tools', 'gas-range', 'viking-range-open'],
  dishwasher: ['samsung-dishwasher-open', 'dishwasher-built-in'],
};
const FAMILIES = Object.keys(POOLS);
// the homepage tickets carry the /coupons terms (completed repair, labor, eligibility, no combining)
const COUPON_TERMS = [
  'Book online and save $25 on any completed appliance repair. Applied automatically to your final invoice; one-time use per household.',
  'Our $109 service call fee is applied toward the cost of your repair when you choose to proceed.',
  '10% off labor for seniors 65 and older and active-duty or veteran military members. Mention this offer when scheduling your appointment.',
  'Offers cannot be combined.',
];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function gallerySet(rel) {
  if (rel === 'index.html') return HOME_SET;
  const h = hash(rel);
  const skip = h % FAMILIES.length;
  const fams = FAMILIES.filter((_, i) => i !== skip);
  return fams.map((f, i) => POOLS[f][(Math.floor(h / 7) + i) % POOLS[f].length]);
}

function tile(id) {
  const p = cat.photos[id];
  if (!p || p.status !== 'use') throw new Error(`gallery photo ${id} is not usable`);
  return { src: '/' + p.out.replace('.webp', '-tile.webp'), alt: p.alt, caption: p.caption };
}

function gallerySection(rel) {
  const items = gallerySet(rel).map((id) => {
    const t = tile(id);
    return `                <figure class="gallery-item">\n` +
      `                    <img src="${t.src}" alt="${t.alt}" width="800" height="600" loading="lazy" decoding="async">\n` +
      `                    <figcaption class="gallery-caption">${t.caption}</figcaption>\n` +
      `                </figure>\n`;
  }).join('');
  return `    <!-- Gallery -->\n    <section class="gallery-section">\n        <div class="container">\n` +
    `            <h2>${HEADING}</h2>\n            <p class="section-intro">${INTRO}</p>\n` +
    `            <div class="gallery-grid">\n${items}            </div>\n        </div>\n    </section>\n\n`;
}

const GALLERY_RE = /(?:[ \t]*<!-- Gallery -->\n)?[ \t]*<section class="gallery-section">[\s\S]*?\n[ \t]*<\/section>\n\n?/;
const COUPONS_RE = /(?:[ \t]*<!-- Coupons -->\n)?[ \t]*<section>\s*<div class="container">\s*<h2>Current Specials<\/h2>[\s\S]*?\n[ \t]*<\/section>\n\n?/;
const CAROUSEL_JS_RE = /\n[ \t]*\/\/ Gallery arrows\n[ \t]*\(function\(\) \{\n[ \t]*var track = document\.getElementById\('galleryTrack'\);[\s\S]*?\n[ \t]*\}\)\(\);\n/;

/** index just after the </section> of the section that holds the appliance strip */
function stripSectionEnd(src) {
  const i = src.indexOf('<div class="services-grid appliance-strip">');
  if (i < 0) return -1;
  const end = src.indexOf('</section>', i);
  return end < 0 ? -1 : end + '</section>'.length + 1;
}

export function renderPage(src, rel) {
  if (!GALLERY_RE.test(src)) return src;
  let out = src.replace(GALLERY_RE, '');
  out = out.replace(CAROUSEL_JS_RE, '\n');
  let coupons = '';
  if (rel === 'index.html') {
    const m = out.match(COUPONS_RE);
    if (m) { coupons = m[0].endsWith('\n\n') ? m[0] : m[0] + '\n'; out = out.replace(m[0], ''); }
    // end the services section right after the strip; the service descriptions get their own section
    const det = out.indexOf('<!-- Detailed service descriptions for SEO -->');
    const stripAt = out.indexOf('<div class="services-grid appliance-strip">');
    const secEnd = out.indexOf('</section>', stripAt);
    if (det > 0 && det < secEnd) {
      const lineStart = out.lastIndexOf('\n', det) + 1;
      out = out.slice(0, lineStart) + '        </div>\n    </section>\n\n    <section>\n        <div class="container">\n' + out.slice(lineStart);
    }
  }
  const at = stripSectionEnd(out);
  if (at < 0) throw new Error(`${rel}: no appliance strip section to follow`);
  const insert = '\n' + gallerySection(rel) + coupons;
  out = out.slice(0, at) + insert + out.slice(at).replace(/^\n+/, '');
  return out;
}

const isMain = process.argv[1] && process.argv[1].endsWith('apply-gallery.mjs');
if (isMain) {
  const problems = [];
  let changed = 0, galleries = 0;
  for (const rel of productionPages()) {
    if (rel === 'thank-you.html') continue;
    const src = read(rel);
    if (!/class="gallery-section"/.test(src)) continue;
    const type = pageType(rel);
    if (!['home', 'city'].includes(type)) problems.push(`${rel}: gallery on a ${type} page`);
    galleries++;
    const out = renderPage(src, rel);
    const items = (out.match(/<figure class="gallery-item">/g) || []).length;
    if (items !== 4) problems.push(`${rel}: ${items} gallery photos, expected 4`);
    const srcs = [...out.matchAll(/<figure class="gallery-item">\s*<img src="([^"]+)"/g)].map((m) => m[1]);
    if (new Set(srcs).size !== srcs.length) problems.push(`${rel}: repeated gallery photo`);
    if (/gallery-track|gallery-arrow|galleryPrev|galleryNext/.test(out)) problems.push(`${rel}: carousel leftovers`);
    const caps = [...out.matchAll(/<figcaption class="gallery-caption">([^<]*)</g)].map((m) => m[1]);
    for (const c of caps) if (/denver|aurora|colorado|, co\b|buffalo|new york/i.test(c)) problems.push(`${rel}: caption names a place: ${c}`);
    if (type === 'home') {
      for (const t of COUPON_TERMS) if (!out.includes(t)) problems.push(`${rel}: coupon terms drifted from /coupons: ${t.slice(0, 60)}`);
      const g = out.indexOf('class="gallery-section"');
      const strip = out.indexOf('appliance-strip');
      const cp = out.indexOf('<h2>Current Specials</h2>');
      const between = out.slice(out.indexOf('</section>', g), cp);
      if (!(strip < g && g < cp) || (between.match(/<section/g) || []).length !== 1) problems.push(`${rel}: order must be strip → gallery → coupons`);
    } else {
      const strip = out.indexOf('appliance-strip');
      const g = out.indexOf('class="gallery-section"');
      const between = out.slice(strip, g);
      if (!(strip > 0 && strip < g) || (between.match(/<section/g) || []).length !== 1) problems.push(`${rel}: gallery must follow the appliance strip section`);
    }
    if (out !== src) {
      changed++;
      if (CHECK) problems.push(`${rel}: drift (run node tools/apply-gallery.mjs)`);
      else writeFileSync(join(ROOT, rel), out);
    }
  }
  const css = read('styles.css');
  if (/\.gallery-track|\.gallery-arrow/.test(css)) problems.push('styles.css: carousel rules left');
  if (CHECK) {
    if (problems.length) { console.log('FAIL - galleries:'); problems.slice(0, 80).forEach((p) => console.log('  ' + p)); process.exit(1); }
    console.log(`PASS - ${galleries} galleries: four distinct catalogued photos in a static grid after the appliance strip, no place-name captions, coupons right after the homepage gallery.`);
  } else {
    problems.forEach((p) => console.log('  ' + p));
    console.log(`apply-gallery: ${changed} page(s) updated, ${galleries} galleries.`);
  }
}
