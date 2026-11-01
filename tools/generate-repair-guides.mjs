#!/usr/bin/env node
/**
 * Repair-or-replace guides — the five guide pages, the guide block on each hub and their sitemap
 * entries. Generate + drift check.
 *
 *   node tools/generate-repair-guides.mjs           write the pages, hub blocks and sitemap entries
 *   node tools/generate-repair-guides.mjs --check   fail if a page, hub block or sitemap entry drifted
 *
 * One guide per Denver appliance family with a hub (refrigerator, washer, dryer, dishwasher,
 * oven / stove / range) — no new service is created (no microwave, freezer or ice-maker guide):
 *
 *   /fridge-repair/repair-or-replace-refrigerator      /washer-repair/repair-or-replace-washer
 *   /dryer-repair/repair-or-replace-dryer              /dishwasher-repair/repair-or-replace-dishwasher
 *   /oven-repair/repair-or-replace-oven-stove-range
 *
 * Copy: tools/repair-guides.json (adapted from the Buffalo guides: Denver's $109 service call
 * credited toward the repair, Denver links, no Buffalo places or rates). Prices: tools/denver-estimates.json
 * only. Photos: tools/denver-images.json. Chrome: the header, footer, sticky bar and scripts are
 * copied from the Denver symptom guide dryer-repair/dryer-not-heating.html at run time, so they
 * always match the site. Each guide has its own title, meta description, H1, canonical, Open Graph
 * tags, BreadcrumbList (Home → hub → guide) and a FAQPage JSON-LD that mirrors its visible FAQ.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, read } from './denver-pages.mjs';
import { offers } from './apply-hero-offers.mjs';

const CHECK = process.argv.includes('--check');
const SITE = 'https://elevaterepair.com';
const LASTMOD = '2026-11-01';
const G = JSON.parse(readFileSync(join(ROOT, 'tools', 'repair-guides.json'), 'utf8')).guides;
const E = JSON.parse(readFileSync(join(ROOT, 'tools', 'denver-estimates.json'), 'utf8'));
const CAT = JSON.parse(readFileSync(join(ROOT, 'tools', 'denver-images.json'), 'utf8'));
const REF = 'dryer-repair/dryer-not-heating.html';

const PHOTOS = {
  fridge: ['fridge-compressor', 'customer-fridge-french'], washer: ['washer-drum-open', 'top-load-washer'],
  dryer: ['dryer-top-removed', 'terminal-block-burnt'], dishwasher: ['samsung-dishwasher-open', 'dishwasher-built-in'],
  oven: ['wall-oven-tools', 'gas-range'],
};
const RENDER = { fridge: 'refrigerator', washer: 'washer', dryer: 'dryer', dishwasher: 'dishwasher', oven: 'range' };
const SYMPTOMS = {
  fridge: [['refrigerator-not-cooling', 'Refrigerator not cooling'], ['water-dispenser-not-working', 'Water dispenser not working'], ['ice-maker-not-making-ice', 'Ice maker not making ice'], ['fridge-leaking-water', 'Fridge leaking water'], ['freezer-not-freezing', 'Freezer not freezing'], ['fridge-making-noise', 'Fridge making noise']],
  washer: [['washer-leaking-water', 'Washer leaking water'], ['washer-not-filling', 'Washer not filling'], ['washer-shaking-vibrating', 'Washer shaking or vibrating'], ['washer-wont-drain', 'Washer won\'t drain'], ['washer-wont-spin', 'Washer won\'t spin'], ['washer-wont-start', 'Washer won\'t start']],
  dryer: [['dryer-not-heating', 'Dryer not heating'], ['dryer-wont-start', 'Dryer won\'t start'], ['dryer-takes-too-long', 'Dryer takes too long'], ['dryer-making-noise', 'Dryer making noise'], ['dryer-wont-tumble', 'Dryer won\'t tumble'], ['dryer-overheating', 'Dryer overheating']],
  dishwasher: [['dishwasher-leaking', 'Dishwasher leaking'], ['dishwasher-making-noise', 'Dishwasher making noise'], ['dishwasher-not-cleaning', 'Dishwasher not cleaning'], ['dishwasher-not-drying', 'Dishwasher not drying'], ['dishwasher-wont-drain', 'Dishwasher won\'t drain'], ['dishwasher-wont-start', 'Dishwasher won\'t start']],
  oven: [['oven-not-heating', 'Oven not heating'], ['oven-temperature-inaccurate', 'Oven temperature inaccurate'], ['burner-not-working', 'Burner not working'], ['oven-door-wont-close', 'Oven door won\'t close'], ['oven-wont-turn-off', 'Oven won\'t turn off'], ['self-clean-not-working', 'Self-clean not working']],
};
const HUB_NAME = { fridge: 'Refrigerator Repair', washer: 'Washer Repair', dryer: 'Dryer Repair', dishwasher: 'Dishwasher Repair', oven: 'Oven & Range Repair' };
const LABEL = { fridge: 'Refrigerator', washer: 'Washer', dryer: 'Dryer', dishwasher: 'Dishwasher', oven: 'Oven, stove & range' };
const ORDER = ['fridge', 'washer', 'dryer', 'dishwasher', 'oven'];

const range = (a, b) => `$${a}&ndash;$${b}`;
const escAttr = (s) => s.replace(/&(?![a-z]+;|#\d+;)/g, '&amp;').replace(/"/g, '&quot;');
const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&rarr;/g, '→').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
function webpSize(rel) {
  const b = readFileSync(join(ROOT, rel));
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') { const bits = b.readUInt32LE(21); return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }; }
  return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
}
function photo(id, ind) {
  const p = CAT.photos[id];
  const sz = webpSize(p.out);
  const nl = '\n' + ind + '     ';
  return `${ind}<img src="/${p.out}"${nl}alt="${p.alt}"${nl}class="section-photo"${nl}width="${sz.w}" height="${sz.h}"${nl}loading="lazy" decoding="async">`;
}

function chrome() {
  const ref = read(REF);
  const head = ref.slice(0, ref.indexOf('</head>'));
  const header = ref.match(/[ \t]*<header>[\s\S]*?<\/header>\n/)[0];
  const tail = ref.slice(ref.indexOf('    <footer class="site-footer">'));
  return { head, header, tail };
}

function costs(key, ind) {
  const h = E.hubs[key];
  const i2 = ind + '    ', i3 = ind + '        ';
  const rows = h.rows.length
    ? `${i2}<table class="estimates-table">\n${i3}<caption>Typical cost by repair (parts and labor)</caption>\n${i3}<thead><tr><th scope="col">Repair</th><th scope="col">Typical cost</th></tr></thead>\n${i3}<tbody>\n` +
      h.rows.map((r) => `${i3}    <tr><td>${r.label}</td><td><span class="price-chip">${range(r.low, r.high)}</span></td></tr>\n`).join('') + `${i3}</tbody>\n${i2}</table>\n`
    : '';
  return `${ind}<h2>What it costs to find out</h2>\n${ind}<div class="rr-costs">\n` +
    `${i2}<p><strong>Our $${E.serviceCall} service call covers the visit and diagnosis and is credited toward your repair when you approve it.</strong> You get the exact repair price after diagnosis, before any work begins.</p>\n` +
    `${i2}<p class="estimates-allin"><span class="estimates-allin-label">Typical total repair cost (parts + labor):</span> <strong>${range(...h.total)}</strong></p>\n` +
    rows +
    `${i2}<p class="estimates-trust">60-day parts &amp; labor warranty</p>\n` +
    `${i2}<p>See the typical costs on our <a href="${h.href}#repair-cost">${HUB_NAME[key].toLowerCase().replace(' & range', ', stove and range')} page</a>. Book online and save $25 on a completed repair.</p>\n` +
    `${ind}</div>\n`;
}

function guidePage(key) {
  const g = G[key];
  const { head, header, tail } = chrome();
  const url = `${SITE}/${g.path}`;
  const ld = (o) => `    <script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n    </script>\n`;
  const crumbs = ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: HUB_NAME[key], item: `${SITE}${g.hub}` },
    { '@type': 'ListItem', position: 3, name: plain(g.h1), item: url },
  ] });
  const faqLd = ld({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })) });
  let h = head
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${g.title}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${escAttr(g.description)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, () => `<link rel="canonical" href="${url}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, () => `<meta property="og:title" content="${escAttr(plain(g.title))}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, () => `<meta property="og:description" content="${escAttr(g.description)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, () => `<meta property="og:url" content="${url}">`)
    .replace(/[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>\n/g, '');
  h = h.replace(/([ \t]*<!-- Microsoft Clarity -->)/, (m) => crumbs + faqLd + m);

  const ind = '                ';
  let photoIdx = 0;
  const body = g.body.split('\n').map((line) => {
    if (line.trim() === '<!-- photo -->') {
      const id = PHOTOS[key][photoIdx++];
      return id ? photo(id, ind) : null;
    }
    return ind + line;
  }).filter((l) => l !== null).join('\n');
  const others = ORDER.filter((k) => k !== key).map((k) => `                <a href="/${G[k].path}" class="city-link">${G[k].h1}</a>`).join('\n');
  const dir = g.path.split('/')[0];
  const symptoms = SYMPTOMS[key].map(([s, t]) => `                <a href="/${dir}/${s}" class="city-link">${t}</a>`).join('\n');
  const faq = g.faq.map((f) => `                    <details class="faq-item">\n                        <summary class="faq-question">${f.q}</summary>\n                        <div class="faq-answer"><p>${f.a}</p></div>\n                    </details>`).join('\n');
  const main =
`    <section class="hero rr-hero">
        <div class="container">
            <h1>${g.h1}</h1>
            <p class="hero-text">${g.heroText}</p>
${offers('            ', false)}            <div class="cta-buttons">
                <a href="tel:7205758432" class="btn btn-primary" onclick="gtag('event','phone_click',{'phone_number':'(720) 575-8432'})">Call Now: (720) 575-8432</a>
                <a href="/book?service=${g.service}" class="btn btn-secondary" onclick="gtag('event','book_click',{'location':'cta'})">Book Online &mdash; $25 Off</a>
            </div>
        </div>
    </section>

    <section>
        <div class="container">
            <div class="content-body">
${body}
${costs(key, ind)}                <p>Ready to find out? <a href="/book?service=${g.service}">Book online</a> or call the number above, and read more about our <a href="${g.hub}">${HUB_NAME[key].toLowerCase().replace(' & range', ', stove and range')} in Denver</a>.</p>
            </div>
        </div>
    </section>

    <section class="mid-cta">
        <div class="container">
            <p>${g.midCta}</p>
        </div>
    </section>

    <section class="section-alt">
        <div class="container">
            <h2>Frequently Asked Questions</h2>
            <div class="content-body">
                <div class="faq-list">
${faq}
                </div>
            </div>
        </div>
    </section>

    <section class="section-alt">
        <div class="container">
            <h2>More Repair-or-Replace Guides</h2>
            <div class="cities-grid">
${others}
            </div>
        </div>
    </section>

    <section class="section-alt">
        <div class="container">
            <h2>${LABEL[key]} Troubleshooting Guides</h2>
            <div class="cities-grid">
${symptoms}
            </div>
            <p class="section-intro" style="margin-top:16px;margin-bottom:0;"><a href="${g.hub}" style="color:#2563eb;">&larr; Back to ${HUB_NAME[key]}</a></p>
        </div>
    </section>

    <section class="final-cta" id="book">
        <div class="container">
            <h2>Need Help Deciding?</h2>
            <p>A diagnosis gives you the exact repair price before any work begins, so you can compare it with the price of a comparable new appliance.</p>
            <div class="cta-buttons">
                <a href="tel:7205758432" class="btn btn-primary" onclick="gtag('event','phone_click',{'phone_number':'(720) 575-8432'})">Call (720) 575-8432</a>
                <a href="/book?service=${g.service}" class="btn btn-secondary" onclick="gtag('event','book_click',{'location':'cta'})">Book Online &mdash; $25 Off</a>
            </div>
        </div>
    </section>

`;
  return `${h}</head>\n<body class="no-hero-image">\n${header}\n${main}${tail}`;
}

function hubBlock(key) {
  const g = G[key], b = g.hubBlock;
  const r = CAT.renders[RENDER[key]];
  const sz = webpSize(r.out);
  const li = (a) => a.map((x) => `                                <li>${x}</li>`).join('\n');
  const links = b.links.map((l) => `                            <a href="${l.href}">${l.text}</a>`).join('\n');
  return `    <!-- repair-guide:start -->
    <section class="guide-section">
        <div class="container">
            <div class="guide-card">
                <figure class="guide-media guide-media--render">
                    <img width="${sz.w}" height="${sz.h}" src="/${r.out}" alt="${r.alt}" loading="lazy" decoding="async">
                </figure>
                <div class="guide-body">
                    <p class="guide-pill">${LABEL[key]} guide</p>
                    <h2>Repair or replace your ${g.noun}?</h2>
                    <p class="guide-intro">${b.intro}</p>
                    <div class="guide-panels">
                        <div class="guide-panel guide-panel--repair">
                            <h3>Usually worth repairing</h3>
                            <ul>
${li(b.repair)}
                            </ul>
                        </div>
                        <div class="guide-panel guide-panel--replace">
                            <h3>Consider replacing when</h3>
                            <ul>
${li(b.replace)}
                            </ul>
                        </div>
                    </div>
                    <p class="guide-note">${b.note}</p>
                    <div class="guide-foot">
                        <div class="guide-links">
                            <span class="guide-links-label">Troubleshooting guides:</span>
${links}
                        </div>
                        <div class="guide-ctas">
                            <a class="btn guide-cta" href="/${g.path}">Read the full repair-or-replace guide &rarr;</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
    <!-- repair-guide:end -->
`;
}

function hubPage(src, key) {
  let out = src.replace(/[ \t]*<!-- repair-guide:start -->[\s\S]*?<!-- repair-guide:end -->\n\n?/, '');
  const at = out.indexOf('id="repair-cost"');
  if (at < 0) throw new Error(`${E.hubs[key].page}: run tools/apply-estimates.mjs first`);
  const end = out.indexOf('</section>', at) + '</section>'.length + 1;
  return out.slice(0, end) + '\n' + hubBlock(key) + out.slice(end).replace(/^\n+/, '\n');
}

function sitemap(src) {
  let out = src;
  for (const k of ORDER) {
    const loc = `${SITE}/${G[k].path}`;
    if (out.includes(`<loc>${loc}</loc>`)) continue;
    out = out.replace('</urlset>', `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${LASTMOD}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>`);
  }
  return out;
}

const problems = [];
const writes = [];
for (const k of ORDER) {
  const rel = `${G[k].path}.html`;
  writes.push([rel, guidePage(k)]);
  writes.push([E.hubs[k].page, hubPage(read(E.hubs[k].page), k)]);
}
writes.push(['sitemap.xml', sitemap(read('sitemap.xml'))]);
let changed = 0;
for (const [rel, out] of writes) {
  const cur = existsSync(join(ROOT, rel)) ? read(rel) : null;
  if (cur === out) continue;
  changed++;
  if (CHECK) problems.push(`${rel}: drift (run node tools/generate-repair-guides.mjs)`);
  else writeFileSync(join(ROOT, rel), out);
}
if (CHECK) {
  if (problems.length) { console.log('FAIL - repair guides:'); problems.forEach((p) => console.log('  ' + p)); process.exit(1); }
  console.log('PASS - five repair-or-replace guides, their hub blocks and sitemap entries match tools/repair-guides.json.');
} else console.log(`generate-repair-guides: ${changed} file(s) written.`);
