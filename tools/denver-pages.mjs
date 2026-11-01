/**
 * Shared page inventory for the Denver tools: which production page is which type.
 *
 * Production = every .html except tools/, the legacy *-repair-denver/ redirect directories,
 * node_modules/ and .git/. The types are decided from the file name, never from the copy:
 *
 *   home            index.html
 *   hub             the five appliance hubs (fridge / washer / dryer / dishwasher / oven-repair-denver)
 *   brand           the 31 brand pages ([brand]-appliance-repair-denver.html and the short [brand].html)
 *   city            the 63 city / neighborhood pages listed on /service-areas
 *   problem-denver  denver-[appliance]-[problem].html
 *   problem-brand   denver-[brand]-[appliance]-[problem].html
 *   problem-city    [city]-[appliance]-[problem].html
 *   subpage         the symptom guides in the canonical [x]-repair/ directories
 *   guide           the repair-or-replace guides in the same directories
 *   info            everything else (booking, legal, FAQ, coupons, brands, service areas, thank-you …)
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const LEGACY = /(^|\/)[a-z]+-repair-denver\//;

export const HUBS = {
  fridge: 'fridge-repair-denver.html',
  washer: 'washer-repair-denver.html',
  dryer: 'dryer-repair-denver.html',
  dishwasher: 'dishwasher-repair-denver.html',
  oven: 'oven-repair-denver.html',
};
export const GUIDE_DIRS = { fridge: 'fridge-repair', washer: 'washer-repair', dryer: 'dryer-repair', dishwasher: 'dishwasher-repair', oven: 'oven-repair' };

const catalogue = JSON.parse(readFileSync(join(ROOT, 'tools', 'denver-images.json'), 'utf8'));
export const BRANDS = Object.fromEntries(Object.entries(catalogue.logos).map(([slug, l]) => [slug, { ...l, file: l.page.slice(1) + '.html' }]));
const BRAND_FILES = new Map(Object.entries(BRANDS).map(([slug, b]) => [b.file, slug]));

function cityList() {
  const s = readFileSync(join(ROOT, 'service-areas.html'), 'utf8');
  const out = [];
  for (const m of s.matchAll(/<a href="\/([a-z-]+)"[^>]*class="city-link"[^>]*>([^<]+)<\/a>/g)) out.push({ slug: m[1], name: m[2].trim() });
  return out;
}
export const CITIES = cityList();
const CITY_SLUGS = new Set(CITIES.map((c) => c.slug));

const APPLIANCE_WORDS = '(dishwasher|dryer|oven|refrigerator|washer)';
const BRAND_PROBLEM = new RegExp(`^denver-(${Object.keys(BRANDS).join('|')})-${APPLIANCE_WORDS}-.+\\.html$`);
const DENVER_PROBLEM = new RegExp(`^denver-${APPLIANCE_WORDS}-.+\\.html$`);
const CITY_PROBLEM = new RegExp(`^([a-z-]+?)-${APPLIANCE_WORDS}-.+\\.html$`);

export function pageType(rel) {
  if (rel === 'index.html') return 'home';
  if (Object.values(HUBS).includes(rel)) return 'hub';
  if (BRAND_FILES.has(rel)) return 'brand';
  if (rel.includes('/')) {
    const dir = rel.split('/')[0];
    if (Object.values(GUIDE_DIRS).includes(dir)) return /\/repair-or-replace-/.test(rel) ? 'guide' : 'subpage';
    return 'info';
  }
  if (CITY_SLUGS.has(rel.replace(/\.html$/, ''))) return 'city';
  if (BRAND_PROBLEM.test(rel)) return 'problem-brand';
  if (DENVER_PROBLEM.test(rel)) return 'problem-denver';
  const m = rel.match(CITY_PROBLEM);
  if (m && CITY_SLUGS.has(m[1])) return 'problem-city';
  return 'info';
}

/** the appliance a page is about (fridge / washer / dryer / dishwasher / oven), or null */
export function pageAppliance(rel) {
  const t = pageType(rel);
  if (t === 'hub') return Object.keys(HUBS).find((k) => HUBS[k] === rel);
  if (t === 'subpage' || t === 'guide') return Object.keys(GUIDE_DIRS).find((k) => rel.startsWith(GUIDE_DIRS[k] + '/'));
  if (t.startsWith('problem')) {
    const m = rel.match(/-(dishwasher|dryer|oven|refrigerator|washer)-/);
    return m ? (m[1] === 'refrigerator' ? 'fridge' : m[1]) : null;
  }
  return null;
}

/** the brand slug of a brand page or brand+problem page, or null */
export function pageBrand(rel) {
  if (BRAND_FILES.has(rel)) return BRAND_FILES.get(rel);
  const m = rel.match(BRAND_PROBLEM);
  return m ? m[1] : null;
}

export function productionPages() {
  const out = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      if (n === '.git' || n === 'node_modules' || n === 'tools') continue;
      const f = join(d, n);
      if (statSync(f).isDirectory()) walk(f);
      else if (n.endsWith('.html')) {
        const rel = relative(ROOT, f).split(sep).join('/');
        if (!LEGACY.test(rel)) out.push(rel);
      }
    }
  })(ROOT);
  return out.sort();
}

export const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** Find the balanced <div …>…</div> that starts at `start` (index of "<div"). Returns the end index. */
export function balancedDivEnd(src, start) {
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(src));) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return m.index + 6;
  }
  return -1;
}
