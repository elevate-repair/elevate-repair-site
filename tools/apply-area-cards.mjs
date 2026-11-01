#!/usr/bin/env node
/**
 * Service-area photo cards — compact blocks of four photo cards and one "See All Service Areas →".
 * Render + drift check.
 *
 *   node tools/apply-area-cards.mjs            render
 *   node tools/apply-area-cards.mjs --check    report drift, exit 1 on any
 *   node tools/apply-area-cards.mjs --report   print every area's inbound card count
 *
 * Source of truth: tools/denver-areas.json (frames = photos with honest alt text, areas = which
 * frames an area's card may show, blocks = the original link list of every area block). Every
 * block of `.area-cards` on a production page becomes:
 *
 *   - four cards (never fewer than three): the block's own first link (the most relevant place,
 *     e.g. the city itself on a city+problem page) and then a per-page rotation through the rest of
 *     the block's links and same-region areas, so sibling pages show different neighbours;
 *   - no photo twice on one page: a card whose preferred frame is already used takes the next frame
 *     its area allows, and is skipped when none is left;
 *   - the label is the area, the alt describes the photo (never claims it shows the area unless it
 *     does — only the Denver skyline is a recognisable photo of its place);
 *   - one `p.area-cards-more` "See All Service Areas →" after the last block of the page; the older
 *     "See all service areas" lines next to the blocks are removed.
 *
 * Coverage: after the per-page choice every city / neighborhood page must be the target of at least
 * MIN_INBOUND cards elsewhere; under-linked areas are swapped in for over-linked ones in blocks where
 * they are a candidate. /service-areas, the nav and the footer keep their full lists.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, read, balancedDivEnd, pageType } from './denver-pages.mjs';

const CHECK = process.argv.includes('--check');
const REPORT = process.argv.includes('--report');
const MIN_INBOUND = 2;
const CARDS = 4;
const data = JSON.parse(readFileSync(join(ROOT, 'tools', 'denver-areas.json'), 'utf8'));
const { frames: FRAMES, areas: AREAS, regions: REGIONS, blocks: BLOCKS } = data;
const hash = (s) => [...s].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381);
const selfHref = (rel) => (rel === 'index.html' ? '/' : '/' + rel.replace(/\.html$/, ''));

function anchor(rel) {
  const t = pageType(rel);
  if (t === 'city') return selfHref(rel);
  if (t === 'problem-city') {
    const m = Object.keys(AREAS).filter((h) => h !== '/' && rel.startsWith(h.slice(1) + '-')).sort((a, b) => b.length - a.length)[0];
    if (m) return m;
  }
  return '/';
}

function candidates(rel, bi) {
  const self = selfHref(rel);
  const orig = [...new Set(BLOCKS[rel][bi])].filter((h) => h !== self && AREAS[h]);
  const reg = AREAS[anchor(rel)].region;
  const extras = REGIONS[reg].map((s) => '/' + s).filter((h) => h !== self && !orig.includes(h) && AREAS[h]);
  return { orig, extras };
}

// ---- plan: pick the cards for every block, then balance inbound coverage ----
/** frames for a page's areas: an exact / own-banner area keeps its own photo first, every other area
 *  takes the first frame it allows that is still free (backtracking); null when impossible */
function assign(list) {
  const res = new Map();
  const used = new Set();
  for (const h of list) {
    const a = AREAS[h];
    if ((a.match === 'exact' || a.match === 'own-banner') && !used.has(a.frames[0])) { res.set(h, a.frames[0]); used.add(a.frames[0]); }
  }
  const rest = list.filter((h) => !res.has(h));
  const bt = (i) => {
    if (i === rest.length) return true;
    for (const f of AREAS[rest[i]].frames) {
      if (used.has(f)) continue;
      used.add(f); res.set(rest[i], f);
      if (bt(i + 1)) return true;
      used.delete(f); res.delete(rest[i]);
    }
    return false;
  };
  return bt(0) ? res : null;
}
const pages = Object.keys(BLOCKS).sort();
const plan = {}; // rel -> [ [href] per block ]
for (const rel of pages) {
  const onPage = [];
  plan[rel] = BLOCKS[rel].map((_, bi) => {
    const { orig, extras } = candidates(rel, bi);
    const rest = orig.slice(1).concat(extras);
    const k = rest.length ? hash(rel + '#' + bi) % rest.length : 0;
    const ordered = (orig.length ? [orig[0]] : []).concat(rest.slice(k), rest.slice(0, k));
    const picks = [];
    for (const href of ordered) {
      if (picks.length === CARDS) break;
      if (onPage.includes(href)) continue;
      if (!assign([...onPage, href])) continue;
      picks.push(href);
      onPage.push(href);
    }
    return picks;
  });
}
function inbound() {
  const c = Object.fromEntries(Object.keys(AREAS).map((h) => [h, 0]));
  for (const rel of pages) for (const b of plan[rel]) for (const h of b) c[h]++;
  return c;
}
let counts = inbound();
for (const area of Object.keys(AREAS).sort()) {
  if (area === '/') continue;
  for (const rel of pages) {
    if (counts[area] >= MIN_INBOUND) break;
    if (selfHref(rel) === area || plan[rel].flat().includes(area)) continue;
    plan[rel].forEach((picks, bi) => {
      if (counts[area] >= MIN_INBOUND || plan[rel].flat().includes(area)) return;
      const { orig, extras } = candidates(rel, bi);
      if (!orig.includes(area) && !extras.includes(area)) return;
      // replace the most-linked card (never the block's first, most relevant card)
      const order = picks.map((h, i) => ({ h, i })).filter(({ h, i }) => i > 0 && counts[h] > MIN_INBOUND).sort((a, b) => counts[b.h] - counts[a.h]);
      for (const { h, i } of order) {
        const trial = plan[rel].flat().map((x) => (x === h ? area : x));
        if (!assign(trial)) continue;
        counts[h]--;
        picks[i] = area;
        counts[area]++;
        break;
      }
    });
  }
}
counts = inbound();
const FRAMES_OF = Object.fromEntries(pages.map((rel) => [rel, assign(plan[rel].flat())]));

// ---- render ----
function card(rel, href, ind) {
  const p = { href, frame: FRAMES_OF[rel].get(href) };
  const f = `/assets/images/areas/${p.frame}`;
  return `${ind}<a href="${p.href}" class="area-card"><img class="area-card-img" src="${f}-card.webp" srcset="${f}-card-sm.webp 400w, ${f}-card.webp 800w" sizes="(min-width: 769px) 25vw, 50vw" alt="${FRAMES[p.frame].alt}" width="800" height="500" loading="lazy" decoding="async"><div class="area-card-label">${AREAS[p.href].name}</div></a>`;
}
const SEE_ALL_OLD = /\n[ \t]*<p class="section-intro"[^>]*>See all <a href="\/service-areas"[^>]*>[^<]*<\/a>\.?<\/p>/g;
const SEE_ALL_NEW_RE = /\n[ \t]*<p class="area-cards-more"><a href="\/service-areas">See All Service Areas &rarr;<\/a><\/p>/g;

export function renderPage(src, rel) {
  if (!BLOCKS[rel]) return src;
  let out = src.replace(SEE_ALL_NEW_RE, '').replace(SEE_ALL_OLD, '');
  const starts = [];
  for (const m of out.matchAll(/<div class="area-cards">/g)) starts.push(m.index);
  if (starts.length !== plan[rel].length) throw new Error(`${rel}: ${starts.length} area blocks, data has ${plan[rel].length}`);
  let res = '';
  let pos = 0;
  starts.forEach((s, bi) => {
    const end = balancedDivEnd(out, s);
    const ind = (out.slice(0, s).match(/\n([ \t]*)$/) || [])[1] ?? '            ';
    const cards = plan[rel][bi].map((h) => card(rel, h, ind + '    ')).join('\n');
    const more = bi === starts.length - 1 ? `\n${ind}<p class="area-cards-more"><a href="/service-areas">See All Service Areas &rarr;</a></p>` : '';
    res += out.slice(pos, s) + `<div class="area-cards">\n${cards}\n${ind}</div>${more}`;
    pos = end;
  });
  return res + out.slice(pos);
}

const isMain = process.argv[1] && process.argv[1].endsWith('apply-area-cards.mjs');
if (isMain) {
  const problems = [];
  let changed = 0, blocks = 0, cards = 0;
  for (const rel of pages) {
    const src = read(rel);
    const out = renderPage(src, rel);
    const used = new Set();
    for (const b of plan[rel]) {
      blocks++;
      cards += b.length;
      if (b.length < 3 || b.length > CARDS) problems.push(`${rel}: a block with ${b.length} cards`);
      for (const href of b) {
        const p = { href, frame: FRAMES_OF[rel].get(href) };
        if (used.has(p.frame)) problems.push(`${rel}: frame ${p.frame} twice on the page`);
        used.add(p.frame);
        if (FRAMES[p.frame].ownOnly && AREAS[p.href].frames[0] !== p.frame) problems.push(`${rel}: ${p.frame} shown for ${p.href}`);
      }
    }
    if ((out.match(/class="area-cards-more"/g) || []).length !== 1) problems.push(`${rel}: expected exactly one See All Service Areas link`);
    if (/cities%20banner|cities banner/.test(out)) problems.push(`${rel}: still references the old banner files`);
    if (out !== src) {
      changed++;
      if (CHECK) problems.push(`${rel}: drift (run node tools/apply-area-cards.mjs)`);
      else writeFileSync(join(ROOT, rel), out);
    }
  }
  for (const [h, n] of Object.entries(counts)) if (h !== '/' && n < MIN_INBOUND) problems.push(`${h}: only ${n} inbound area card(s)`);
  if (REPORT) for (const [h, n] of Object.entries(counts).sort((a, b) => a[1] - b[1])) console.log(`${String(n).padStart(4)}  ${h}  (${AREAS[h].frames[0]}, ${AREAS[h].match})`);
  const summary = `${blocks} block(s), ${cards} card(s) on ${pages.length} page(s); every city page has ≥ ${MIN_INBOUND} inbound cards (min ${Math.min(...Object.entries(counts).filter(([h]) => h !== '/').map(([, n]) => n))})`;
  if (CHECK) {
    if (problems.length) { console.log('FAIL - area cards:'); problems.slice(0, 80).forEach((p) => console.log('  ' + p)); process.exit(1); }
    console.log(`PASS - ${summary}; no photo twice on a page; one See All link per page.`);
  } else {
    problems.forEach((p) => console.log('  ' + p));
    console.log(`apply-area-cards: ${changed} page(s) updated; ${summary}.`);
  }
}
