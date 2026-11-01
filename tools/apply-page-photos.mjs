#!/usr/bin/env node
/**
 * Content photos (img.section-photo) — honest alt text, EXIF-free exports and photos that match the
 * page. Render + drift check.
 *
 *   node tools/apply-page-photos.mjs           render
 *   node tools/apply-page-photos.mjs --check   report drift, exit 1 on any
 *
 * Every content photo is looked up in tools/denver-images.json (by its original or export path):
 *
 *   - it is served from its EXIF-free export with the export's width / height, and its alt text is
 *     the catalogue's — a description of what the photo shows that never names a city (the place of
 *     each job is not recorded, so nothing is presented as a Denver job or a Denver customer);
 *   - it must have status "use": the retired photos (refrigerators with children's portraits on the
 *     door, the LG washer photo that was published as a dryer, the range hood, the combi-steamer)
 *     are replaced;
 *   - it must fit the page: on a page about one appliance (hubs, problem pages, symptom guides) or
 *     under a heading that names one, the photo shows that appliance or is a generic technician /
 *     repair shot; on a brand page or brand+problem page it never shows another brand's logo;
 *   - one shot appears at most once per page, gallery tiles included (the two technician photos are
 *     one scene).
 *
 * A photo that fails is replaced by the best catalogue photo that fits, chosen deterministically
 * (appliance match first, then a per-page rotation so sibling pages differ). Only the <img> changes.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, productionPages, pageAppliance, pageBrand, read } from './denver-pages.mjs';

const CHECK = process.argv.includes('--check');
const cat = JSON.parse(readFileSync(join(ROOT, 'tools', 'denver-images.json'), 'utf8'));
const PHOTOS = cat.photos;

function webpSize(rel) {
  const b = readFileSync(join(ROOT, rel));
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') { const bits = b.readUInt32LE(21); return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }; }
  return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
}
const SIZE = {};
for (const [id, p] of Object.entries(PHOTOS)) if (p.status === 'use') SIZE[id] = webpSize(p.out);

// any original or export path → photo id
const BY_PATH = new Map();
for (const [id, p] of Object.entries(PHOTOS)) {
  for (const s of p.sources) { BY_PATH.set('/' + s, id); BY_PATH.set('/' + s.replace(/ /g, '%20'), id); }
  if (p.out) BY_PATH.set('/' + p.out, id);
}
const groupOf = (id) => PHOTOS[id].group || id;
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11);

const HEADING_APPLIANCE = [
  [/dishwasher/i, 'dishwasher'], [/washer|washing machine|laundry/i, 'washer'], [/dryer/i, 'dryer'],
  [/refrigerat|fridge|freezer|ice maker|water dispenser/i, 'fridge'], [/microwave/i, 'microwave'],
  [/oven|range|stove|cooktop|burner/i, 'oven'],
];
function headingTopic(src, at) {
  const before = src.slice(Math.max(0, at - 2500), at);
  const hs = [...before.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)];
  if (!hs.length) return null;
  const t = hs[hs.length - 1][1].replace(/<[^>]+>/g, '');
  for (const [re, a] of HEADING_APPLIANCE) if (re.test(t)) return a;
  return null;
}

function fits(id, topic, brand) {
  const p = PHOTOS[id];
  if (!p || p.status !== 'use') return false;
  if (brand && p.brand && p.brand !== brand) return false;
  if (topic && !p.appliances.includes(topic) && !p.appliances.includes('generic')) return false;
  return true;
}
const KIND_RANK = { repair: 3, tech: 2, appliance: 2, customer: 1 };
function pick(rel, slot, topic, brand, used) {
  const ids = Object.keys(PHOTOS).filter((id) => fits(id, topic, brand) && !used.has(groupOf(id)));
  ids.sort((a, b) => {
    const sa = (topic && PHOTOS[a].appliances.includes(topic) ? 10 : 0) + KIND_RANK[PHOTOS[a].kind];
    const sb = (topic && PHOTOS[b].appliances.includes(topic) ? 10 : 0) + KIND_RANK[PHOTOS[b].kind];
    if (sa !== sb) return sb - sa;
    return hash(rel + slot + a) - hash(rel + slot + b);
  });
  return ids[0] || null;
}

const IMG_RE = /<img\b[^>]*class="section-photo"[^>]*>|<img\s+src="[^"]*"\s+alt="[^"]*"\s+class="section-photo"[\s\S]*?>/g;

export function renderPage(src, rel) {
  const topicPage = pageAppliance(rel);
  const brand = pageBrand(rel);
  const slots = [];
  for (const m of src.matchAll(IMG_RE)) {
    const s = (m[0].match(/src="([^"]+)"/) || [])[1];
    slots.push({ at: m.index, tag: m[0], src: s, id: BY_PATH.get(s) || null });
  }
  // the gallery tiles on the page count as used: a section photo never repeats a gallery shot
  const used = new Set();
  for (const m of src.matchAll(/\/assets\/images\/photos\/([a-z0-9-]+)-tile\.webp/g)) if (PHOTOS[m[1]]) used.add(groupOf(m[1]));
  const decisions = [];
  slots.forEach((sl, i) => {
    const topic = topicPage || headingTopic(src, sl.at);
    let id = sl.id;
    if (!id || !fits(id, topic, brand) || used.has(groupOf(id))) {
      const repl = pick(rel, i, topic, brand, used);
      decisions.push({ slot: i, from: id || sl.src, to: repl, topic });
      id = repl;
    }
    sl.final = id;
    if (id) used.add(groupOf(id));
  });
  let out = '';
  let pos = 0;
  for (const sl of slots) {
    out += src.slice(pos, sl.at);
    if (!sl.final) { out += sl.tag; pos = sl.at + sl.tag.length; continue; }
    const p = PHOTOS[sl.final];
    const sz = SIZE[sl.final];
    const indent = (sl.tag.match(/\n([ \t]*)\S/) || [])[1];
    const nl = indent !== undefined ? `\n${indent}` : ' ';
    out += `<img src="/${p.out}"${nl}alt="${p.alt}"${nl}class="section-photo"${nl}width="${sz.w}" height="${sz.h}"${nl}loading="lazy" decoding="async">`;
    pos = sl.at + sl.tag.length;
  }
  out += src.slice(pos);
  return { out, decisions, slots };
}

const isMain = process.argv[1] && process.argv[1].endsWith('apply-page-photos.mjs');
if (isMain) {
  const problems = [];
  let changed = 0, total = 0, replaced = 0;
  const summary = {};
  for (const rel of productionPages()) {
    if (rel === 'thank-you.html') continue;
    const src = read(rel);
    const { out, decisions, slots } = renderPage(src, rel);
    total += slots.length;
    replaced += decisions.length;
    for (const d of decisions) {
      const k = `${String(d.from).replace(/^.*\//, '')} → ${d.to}`;
      summary[k] = (summary[k] || 0) + 1;
      if (!d.to) problems.push(`${rel}: no fitting photo for slot ${d.slot} (${d.topic})`);
    }
    for (const sl of slots) if (!sl.final) problems.push(`${rel}: uncatalogued photo ${sl.src}`);
    if (out !== src) {
      changed++;
      if (CHECK) problems.push(`${rel}: drift (run node tools/apply-page-photos.mjs)`);
      else writeFileSync(join(ROOT, rel), out);
    }
  }
  if (CHECK) {
    if (problems.length) { console.log('FAIL - content photos:'); problems.slice(0, 80).forEach((p) => console.log('  ' + p)); process.exit(1); }
    console.log(`PASS - ${total} content photos: catalogued exports, honest alt text, on topic, no repeats, no other brand's logo.`);
  } else {
    for (const [k, v] of Object.entries(summary).sort((a, b) => b[1] - a[1])) console.log(`  ${v}× ${k}`);
    problems.forEach((p) => console.log('  ' + p));
    console.log(`apply-page-photos: ${changed} page(s) updated, ${total} photo(s), ${replaced} replaced.`);
  }
}
