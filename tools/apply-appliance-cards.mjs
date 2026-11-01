#!/usr/bin/env node
/**
 * Service cards — appliance renders, problem icons and the compact appliance strip. Render + check.
 *
 *   node tools/apply-appliance-cards.mjs                    render every page
 *   node tools/apply-appliance-cards.mjs --only=index.html  render one page (used to trial a change)
 *   node tools/apply-appliance-cards.mjs --check            report drift, exit 1 on any
 *
 * Every `.services-grid` block on a production page is rewritten card by card; titles, copy and
 * links are never touched:
 *
 *   appliance card  the title names an appliance ("Refrigerator Repair", "Bosch Washers") → the
 *                   render that shows it (matched by looking at the image: refrigerator, washer,
 *                   dryer, dishwasher, range — oven / stove / cooktop cards show the range); an
 *                   appliance with no render (freezer, wine cooler, microwave, ventilation) gets a
 *                   CSS icon in the same stage, never another appliance's picture
 *   problem card    the title names a fault ("Washer Won't Drain") or it links a symptom guide →
 *                   one CSS icon chosen from the fault (never an emoji)
 *
 * A grid whose cards are all appliance cards on the homepage, a city page or a brand page becomes
 * the compact appliance strip (`services-grid appliance-strip`): one row, scrolled sideways inside
 * the component on phones with the next card peeking in, several cards at once on desktop, no
 * autoplay and no page-level horizontal scroll. Problem grids on the hubs stay grids.
 *
 * Brand pages book from the card: every appliance card on the 31 brand pages is a `div.book-card`
 * whose main link opens the booking form with the appliance preselected (/book?service=<alias>, an
 * alias book.html's preselect script reads — never a brand parameter, the form has no brand field)
 * and ends with "Book Repair", followed by a compact "Repair details →" link to the hub the card
 * used to link. A card with no hub of its own (microwaves, ventilation) has no details link;
 * ventilation books plain /book (the form has no ventilation option).
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, productionPages, pageType, read, balancedDivEnd } from './denver-pages.mjs';

const CHECK = process.argv.includes('--check');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const cat = JSON.parse(readFileSync(join(ROOT, 'tools', 'denver-images.json'), 'utf8'));

function webpSize(rel) {
  const b = readFileSync(join(ROOT, rel));
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') { const bits = b.readUInt32LE(21); return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }; }
  return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
}
const RENDERS = Object.fromEntries(Object.entries(cat.renders).map(([k, r]) => [k, { src: '/' + r.out, alt: r.alt, ...webpSize(r.out) }]));

// title → render key or icon (order matters: wine before refrigerator, dishwasher before washer)
const APPLIANCE_RULES = [
  [/wine|beverage/i, { icon: 'cold' }],
  [/ice maker/i, { icon: 'cold' }],
  [/freezer/i, { icon: 'cold' }],
  [/refrigerat|fridge/i, { render: 'refrigerator' }],
  [/microwave/i, { icon: 'microwave' }],
  [/ventilation|range hood|\bhoods?\b/i, { icon: 'air' }],
  [/dishwasher/i, { render: 'dishwasher' }],
  [/washer|washing/i, { render: 'washer' }],
  [/dryer/i, { render: 'dryer' }],
  [/oven|range|stove|cooktop/i, { render: 'range' }],
];
const PROBLEM_HREF_RE = /^\/(?:dishwasher|dryer|fridge|oven|washer)-repair\/[a-z0-9-]+$/;
const PROBLEM_TITLE_RE = /\b(not|won'?t|leak\w*|nois\w*|shak\w*|vibrat\w*|too long|overheat\w*|door|burner|self-?clean\w*|dispenser|inaccurate|smell\w*)\b/i;
const ICON_RULES = [
  [/self-?clean|not cleaning|not washing|spots|residue/i, 'clean'],
  [/\b(door|latch|lid)\b/i, 'door'],
  [/burner|igniter|flame|gas smell/i, 'flame'],
  [/\b(spin\w*|tumbl\w*|agitat\w*|turntable)\b/i, 'motion'],
  [/too long|\bslow\b/i, 'time'],
  [/nois\w*|\bloud\b|shak\w*|vibrat\w*|rattl\w*|grind\w*|\bhum\w*/i, 'noise'],
  [/leak\w*|drain\w*|fill\w*|\bwater\b|dispenser|\bwet\b/i, 'water'],
  [/not cooling|not cold|too warm|not freezing|frost\w*|\bice\b/i, 'cold'],
  [/heat\w*|too hot|temperature|not drying|\bwarm\b|won'?t turn off/i, 'heat'],
  [/won'?t (start|turn|run|power)|no power|\bdead\b|not (starting|turning on|working|running)|trips|breaker|display|control/i, 'power'],
  [/\b(vent\w*|hood\w*|fan|airflow)\b/i, 'air'],
];
const first = (rules, s) => { for (const [re, v] of rules) if (re.test(s)) return v; return null; };
const text = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function classify(title, href) {
  if ((href && PROBLEM_HREF_RE.test(href)) || PROBLEM_TITLE_RE.test(title)) return { kind: 'problem', icon: first(ICON_RULES, title) || 'generic' };
  const a = first(APPLIANCE_RULES, title);
  if (a) return { kind: 'appliance', ...a };
  return { kind: 'problem', icon: first(ICON_RULES, title) || 'generic' };
}

function visual(c) {
  if (c.render) {
    const r = RENDERS[c.render];
    return `<img class="appliance-card-img" src="${r.src}" alt="${r.alt}" width="${r.w}" height="${r.h}" loading="lazy" decoding="async">`;
  }
  return `<span class="card-icon card-icon--${c.icon}${c.kind === 'appliance' ? ' card-icon--stage' : ''}" aria-hidden="true"></span>`;
}

const VISUAL_RE = /[ \t]*(?:<img\b[^>]*class="appliance-card-img"[^>]*>|<img\s+class="appliance-card-img"[\s\S]*?\/?>|<div class="service-icon">[\s\S]*?<\/div>|<span class="card-icon[^"]*"[^>]*><\/span>)[ \t]*\n?/g;

/** rewrite one card (the full card HTML, opening tag through closing tag) */
function rewriteCard(card) {
  const title = text((card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || '');
  const href = (card.match(/^<a\b[^>]*href="([^"]+)"/) || card.match(/<a\b[^>]*class="service-card"[^>]*href="([^"]+)"/) || card.match(/<a href="([^"]+)" class="service-card/) || [])[1];
  const c = classify(title, href);
  let out = card.replace(VISUAL_RE, '');
  const h3 = out.match(/\n([ \t]*)<h3/);
  if (!h3) return { out: card, c, title };
  out = out.slice(0, h3.index + 1) + h3[1] + visual(c) + '\n' + out.slice(h3.index + 1);
  return { out, c, title };
}

/** the cards of a grid: top-level a.service-card / div.service-card / div.book-card */
function cards(inner) {
  const out = [];
  const re = /<a\b[^>]*class="service-card[^"]*"[^>]*>|<div class="(?:service-card|book-card)[^"]*">/g;
  for (let m; (m = re.exec(inner));) {
    let end;
    if (m[0].startsWith('<a')) end = inner.indexOf('</a>', m.index) + 4;
    else end = balancedDivEnd(inner, m.index);
    out.push({ start: m.index, end });
    re.lastIndex = end;
  }
  return out;
}

// card title → the book.html ?service= alias (the form's own appliance options only)
const SERVICE_RULES = [
  [/wine|beverage|refrigerat|fridge|freezer|ice maker/i, 'refrigerator'],
  [/dishwasher/i, 'dishwasher'],
  [/washer|washing/i, 'washer'],
  [/dryer/i, 'dryer'],
  [/microwave/i, 'microwave'],
  [/oven|range|stove|cooktop/i, 'oven'],
];
const HUB_FOR = { refrigerator: '/fridge-repair-denver', dishwasher: '/dishwasher-repair-denver', washer: '/washer-repair-denver', dryer: '/dryer-repair-denver', oven: '/oven-repair-denver' };
export const serviceFor = (title) => first(SERVICE_RULES, title);

function bookCard(card, ind) {
  // the service-card link (or the dead div card) and an existing details link
  const a = card.match(/<a\b[^>]*class="service-card[^"]*"[^>]*>([\s\S]*?)<\/a>/) || card.match(/<div class="service-card">([\s\S]*?)<\/div>\s*$/);
  const body = (a ? a[1] : card).replace(/\s*<span class="service-card-cta">[\s\S]*?<\/span>/, '');
  const title = text((body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || '');
  const svc = serviceFor(title);
  const oldHref = (card.match(/<a\b[^>]*href="([^"]+)"[^>]*class="service-card/) || card.match(/<a class="service-card" href="([^"]+)"/) || [])[1];
  let details = (card.match(/<a href="([^"]+)" class="book-card-details"/) || [])[1] || (oldHref && !oldHref.startsWith('/book') ? oldHref : null);
  if (details && svc && HUB_FOR[svc] && details !== HUB_FOR[svc]) details = HUB_FOR[svc];
  if (!svc || !HUB_FOR[svc]) details = null; // microwave / ventilation: no hub of their own
  const href = svc ? `/book?service=${svc}` : '/book';
  const i2 = ind + '    ';
  const inner = body.replace(/^\s*\n/, '').replace(/\s+$/, '');
  return `<div class="book-card">\n${i2}<a href="${href}" class="service-card">\n${inner}\n${i2}    <span class="service-card-cta">Book Repair</span>\n${i2}</a>\n` +
    (details ? `${i2}<a href="${details}" class="book-card-details">Repair details &rarr;</a>\n` : '') + `${ind}</div>`;
}

export function renderPage(src, rel) {
  const type = pageType(rel);
  let out = '';
  let pos = 0;
  const report = [];
  const re = /<div class="services-grid[^"]*">/g;
  for (let m; (m = re.exec(src));) {
    const end = balancedDivEnd(src, m.index);
    const openEnd = m.index + m[0].length;
    const inner = src.slice(openEnd, end - 6);
    const list = cards(inner);
    let rebuilt = '';
    let p = 0;
    const kinds = [];
    for (const { start, end: e } of list) {
      const card = inner.slice(start, e);
      let r;
      if (card.startsWith('<div class="book-card')) {
        // a brand-page booking card: rewrite the service-card link inside it
        const a = card.match(/<a\b[^>]*class="service-card[^"]*"[^>]*>[\s\S]*?<\/a>/);
        const rr = rewriteCard(a[0]);
        r = { out: card.replace(a[0], () => rr.out), c: rr.c, title: rr.title };
      } else r = rewriteCard(card);
      kinds.push(r.c.kind);
      rebuilt += inner.slice(p, start) + r.out;
      p = e;
    }
    rebuilt += inner.slice(p);
    const strip = ['home', 'city', 'brand'].includes(type) && kinds.length > 0 && kinds.every((k) => k === 'appliance');
    if (strip && type === 'brand') {
      const again = cards(rebuilt);
      let rb = '', q = 0;
      for (const { start, end: e } of again) {
        const ind = (rebuilt.slice(0, start).match(/\n([ \t]*)$/) || [])[1] || '                ';
        rb += rebuilt.slice(q, start) + bookCard(rebuilt.slice(start, e), ind);
        q = e;
      }
      rebuilt = rb + rebuilt.slice(q);
    }
    const open = strip ? '<div class="services-grid appliance-strip">' : '<div class="services-grid">';
    out += src.slice(pos, m.index) + open + rebuilt + '</div>';
    pos = end;
    re.lastIndex = end;
    report.push({ strip, cards: kinds.length });
  }
  out += src.slice(pos);
  return { out, report };
}

const isMain = process.argv[1] && process.argv[1].endsWith('apply-appliance-cards.mjs');
if (isMain) {
  const problems = [];
  let changed = 0, strips = 0, grids = 0, cardsSeen = 0;
  for (const rel of productionPages()) {
    if (ONLY && rel !== ONLY) continue;
    if (rel === 'thank-you.html') continue;
    const src = read(rel);
    const { out, report } = renderPage(src, rel);
    for (const r of report) { grids++; cardsSeen += r.cards; if (r.strip) strips++; }
    if (/class="service-icon"/.test(out)) problems.push(`${rel}: emoji service-icon left`);
    if (pageType(rel) === 'brand') {
      const bc = [...out.matchAll(/<div class="book-card">\s*<a href="([^"]+)" class="service-card">[\s\S]*?<span class="service-card-cta">Book Repair<\/span>\s*<\/a>/g)];
      const total = (out.match(/class="service-card"/g) || []).length;
      if (!bc.length || bc.length !== total) problems.push(`${rel}: ${total - bc.length} appliance card(s) do not book`);
      for (const m of bc) if (!/^\/book(\?service=(refrigerator|washer|dryer|dishwasher|oven|microwave))?$/.test(m[1])) problems.push(`${rel}: unsupported booking link ${m[1]}`);
    }
    if (rel === 'book.html' && !/Appliance preselection \(\/book\?service=<appliance>\)/.test(out)) problems.push('book.html: ?service= preselect script missing');
    if (/\/assets\/images\/appliances\/[a-z-]+\.jpg/.test(out)) problems.push(`${rel}: retired card JPG referenced`);
    if (out !== src) {
      changed++;
      if (CHECK) problems.push(`${rel}: drift (run node tools/apply-appliance-cards.mjs)`);
      else writeFileSync(join(ROOT, rel), out);
    }
  }
  const css = read('styles.css');
  for (const sel of ['.appliance-strip', '.card-icon--water', '.card-icon--stage']) if (!css.includes(sel)) problems.push(`styles.css: missing ${sel}`);
  const summary = `${grids} grid(s), ${cardsSeen} card(s), ${strips} appliance strip(s)`;
  if (CHECK) {
    if (problems.length) { console.log('FAIL - service cards:'); problems.slice(0, 80).forEach((p) => console.log('  ' + p)); process.exit(1); }
    console.log(`PASS - service cards: ${summary}; renders and icons match every title.`);
  } else {
    problems.forEach((p) => console.log('  ' + p));
    console.log(`apply-appliance-cards: ${changed} page(s) updated; ${summary}.`);
  }
}
