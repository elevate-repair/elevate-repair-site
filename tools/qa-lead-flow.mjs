#!/usr/bin/env node
/**
 * Browser test of the Denver booking flow: confirmed sending, retries, the thank-you page, the GA4
 * form events and the attribution the forms post. Hermetic: the pages are served from this checkout,
 * every Apps Script request is answered by tools/lead-capture/denver-lead-ack.gs running in Node
 * against stand-ins (tools/qa-lead-ack.mjs), and every other third-party request is stubbed. No real
 * lead, message, conversion or analytics hit leaves the machine.
 *
 *   node tools/qa-lead-flow.mjs        (needs Playwright + Chromium; skipped when not installed)
 *
 * What a pass proves: the site's side of the contract. It does not prove that the live Apps Scripts
 * answer this way (they need the manual change in tools/lead-capture/denver-lead-ack.gs), that GA4
 * received an event, or that S Protocol stored a lead.
 */
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { makeWorld } from './qa-lead-ack.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { console.log('Lead flow test SKIPPED - playwright is not installed.'); process.exit(0); }
}

const STANDARD = 'AKfycbzCuzqtswIhfkEbAGiOeJr0K747SwHFF79NiB0esI7xtbp7tACAyxUFrJ5LuAo6T0gy7Q';
const BOOK_ONLINE = 'AKfycbxQ12NI1weS3qIh8xf7TFvwZi2Cq6BwMPXPLvABL7GMWTXW3EV-HMpt8A7OBFbTEb4zfQ';
const ADS_LABEL = 'AW-17878510208/__r8COvo8-obEIDVkc1C';
const PII = ['Audit Test', '555-0134', '5550134', '100 Test St', 'audit message', 'audit@example.com'];
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p.includes('..')) return res.writeHead(400).end();
  const cands = p.endsWith('/') ? [join(ROOT, p, 'index.html')] : extname(p) ? [join(ROOT, p)] : [join(ROOT, p + '.html'), join(ROOT, p, 'index.html')];
  const hit = cands.find((f) => { try { return statSync(f).isFile(); } catch { return false; } });
  if (!hit) return res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  res.writeHead(200, { 'content-type': MIME[extname(hit)] || 'application/octet-stream' }).end(readFileSync(hit));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

const results = [];
const check = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail: cond ? '' : String(detail).slice(0, 300) });
const allEvents = [];

/** A browser context whose Apps Script is the .gs wrapper; `mode` decides how a POST is answered. */
async function session({ viewport = { width: 1440, height: 900 }, clock = false } = {}) {
  const world = makeWorld();
  const st = { mode: 'ok', posts: [], dl: [], world: world.world };
  const ctx = await browser.newContext({ viewport });
  await ctx.exposeBinding('__rec', (s, path, item) => { const v = { path, item: JSON.parse(item) }; st.dl.push(v); allEvents.push(v); });
  await ctx.addInitScript(() => {
    const dl = [];
    Object.defineProperty(dl, 'push', { value: function () { for (const a of arguments) { try { window.__rec(location.pathname, JSON.stringify(Array.from(a))); } catch (e) { /* not an arguments object */ } } return Array.prototype.push.apply(this, arguments); } });
    window.dataLayer = dl;
    document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"]'); if (a) e.preventDefault(); });
  });
  await ctx.route((u) => u.hostname !== '127.0.0.1', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.hostname === 'script.google.com' && req.method() === 'POST') {
      const id = (u.pathname.match(/\/macros\/s\/([^/]+)\/exec/) || [])[1];
      const params = Object.fromEntries(new URLSearchParams(req.postData() || ''));
      st.posts.push({ id, params, contentType: req.headers()['content-type'] || '' });
      const mode = st.mode;
      if (mode === 'hang') return; // never answered
      if (mode === 'reset') return route.abort('connectionreset');
      if (mode === 'delay') await new Promise((r) => setTimeout(r, 600));
      if (mode === 'http500') return route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/html' }, body: '<html>Error</html>' });
      const answer = mode === 'textok' ? { text: 'ok', mime: 'text/plain' } : world.post(params);
      if (mode === 'lost') return route.abort('connectionreset'); // processed, answer lost
      // The live Apps Script answers through a 302 to script.googleusercontent.com, which serves the
      // output with Access-Control-Allow-Origin: *. Playwright cannot intercept a followed redirect,
      // so the stand-in answers in one hop with the same headers; the redirect itself is part of the
      // one controlled end-to-end test.
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': answer.mime === 'application/json' ? 'application/json' : 'text/plain' }, body: answer.text });
    }
    if (req.resourceType() === 'script') return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    return route.abort();
  });
  const page = await ctx.newPage();
  if (clock) await page.clock.install();
  return { ctx, page, st };
}
const events = (st, path) => st.dl.filter((d) => !path || d.path === path).map((d) => d.item).filter((i) => i[0] === 'event');
const named = (st, name, path) => events(st, path).filter((i) => i[1] === name);

async function fill(page) {
  await page.evaluate(() => {
    const f = document.getElementById('bookingForm');
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    for (const el of f.querySelectorAll('input, select, textarea')) {
      const n = el.name;
      if (!n || el.type === 'hidden' || n === 'website') continue;
      if (n === 'name') set(el, 'Audit Test');
      else if (n === 'phone') set(el, '(720) 555-0134');
      else if (n === 'address') set(el, '100 Test St, Denver, CO');
      else if (n === 'unit') set(el, '');
      else if (n === 'email') set(el, 'audit@example.com');
      else if (el.type === 'date') set(el, new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
      else if (el.tagName === 'SELECT') { if (!el.value) { const o = [...el.options].find((x) => x.value && !x.disabled); if (!o) { const add = document.createElement('option'); add.value = 'Other / Not sure'; add.textContent = 'Other'; el.appendChild(add); } set(el, (o || el.options[el.options.length - 1]).value); } }
      else if (el.tagName === 'TEXTAREA') set(el, 'audit message');
    }
  });
}
async function openForm(page) {
  const hidden = await page.evaluate(() => { const f = document.getElementById('bookingForm'); return !!f && f.style.display === 'none'; });
  if (hidden) await page.click('.selector-btn');
}
async function submit(page) {
  if (await page.$('#confirmBookingBtn')) {
    await page.evaluate(() => document.getElementById('confirmBookingBtn').click());
  } else {
    await page.click('#bookingForm button[type=submit]');
  }
}
const formValues = (page) => page.evaluate(() => ['name', 'phone', 'address', 'message'].map((n) => { const el = document.querySelector(`#bookingForm [name="${n}"]`); return el ? el.value : null; }));
const pageSource = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const sourceOf = (rel) => (pageSource(rel).match(/<input type="hidden" name="source" value="([^"]+)"/) || [])[1];

// ── 1. confirmed success on every form type: endpoint, source, service, ids, thank-you ──────────
const FORMS = [
  { url: '/', file: 'index.html', endpoint: STANDARD },
  { url: '/aurora', file: 'aurora.html', endpoint: STANDARD },
  { url: '/denver-washer-not-filling', file: 'denver-washer-not-filling.html', endpoint: STANDARD },
  { url: '/book?service=refrigerator', file: 'book.html', endpoint: STANDARD, service: 'Refrigerator Repair' },
  { url: '/contact', file: 'contact.html', endpoint: STANDARD },
  { url: '/book-online', file: 'book-online.html', endpoint: BOOK_ONLINE },
];
for (const f of FORMS) {
  const { ctx, page, st } = await session();
  await page.goto(BASE + f.url, { waitUntil: 'load' });
  await openForm(page);
  await fill(page);
  const want = await page.evaluate(() => { const f = document.getElementById('bookingForm'); const s = f.querySelector('[name="service"]'); return s ? s.value : ''; });
  await Promise.all([page.waitForURL('**/thank-you*', { timeout: 10000 }), submit(page)]);
  await page.waitForTimeout(300);
  const p = st.posts[0] || { params: {} };
  let attr = null; try { attr = JSON.parse(p.params.attribution); } catch { /* */ }
  check(`${f.url}: one POST to its own endpoint`, st.posts.length === 1 && p.id === f.endpoint, JSON.stringify(st.posts.map((x) => x.id)));
  check(`${f.url}: form-encoded simple request (no preflight)`, /application\/x-www-form-urlencoded/.test(p.contentType), p.contentType);
  check(`${f.url}: source unchanged (${sourceOf(f.file)})`, p.params.source === sourceOf(f.file), p.params.source);
  check(`${f.url}: service posted (${want || f.service})`, p.params.service && p.params.service === (f.service || want), p.params.service);
  check(`${f.url}: submission_id + attribution v1 posted`, /^[A-Za-z0-9-]{16,64}$/.test(p.params.submission_id || '') && attr && attr.v === 1 && attr.first);
  const conv = named(st, 'conversion', '/thank-you.html');
  check(`${f.url}: thank-you fires the unchanged Ads conversion once and generate_lead once`, conv.length === 1 && conv[0][2].send_to === ADS_LABEL && named(st, 'generate_lead', '/thank-you.html').length === 1);
  check(`${f.url}: Telegram stand-in got exactly one lead`, st.world.telegram.length === 1);
  const flags = await page.evaluate(() => [sessionStorage.getItem('lead_submitted'), sessionStorage.getItem('er_lead_sid')]);
  check(`${f.url}: thank-you consumed the flag; the submission id was cleared`, flags[0] === null && flags[1] === null, JSON.stringify(flags));
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(200);
  await page.goBack({ waitUntil: 'load' }).catch(() => {}); await page.goForward({ waitUntil: 'load' }).catch(() => {}); await page.waitForTimeout(200);
  check(`${f.url}: reload / back / forward on thank-you add no lead`, named(st, 'conversion').length === 1 && named(st, 'generate_lead').length === 1);
  await ctx.close();
}

// ── 2. failures keep the visitor on the page with the data, then a retry goes through once ──────
for (const mode of ['http500', 'reset', 'textok']) {
  const { ctx, page, st } = await session();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await openForm(page); await fill(page);
  const before = await formValues(page);
  st.mode = mode;
  await submit(page);
  await page.waitForSelector('.lead-send-error', { state: 'visible', timeout: 10000 });
  const msg = await page.textContent('.lead-send-error');
  const btn = await page.$eval('#bookingForm button[type=submit]', (b) => ({ disabled: b.disabled, text: b.textContent.trim() }));
  const sid1 = st.posts[0].params.submission_id;
  check(`${mode}: stays on the page with a clear message`, page.url().startsWith(BASE + '/') && !page.url().includes('thank-you') && /could not confirm/i.test(msg), msg);
  check(`${mode}: every field kept as typed; button usable again`, JSON.stringify(await formValues(page)) === JSON.stringify(before) && !btn.disabled && /Book Online/.test(btn.text), JSON.stringify(btn));
  check(`${mode}: no thank-you flag, no conversion, no generate_lead`, (await page.evaluate(() => sessionStorage.getItem('lead_submitted'))) === null && !named(st, 'conversion').length && !named(st, 'generate_lead').length);
  st.mode = 'ok';
  await Promise.all([page.waitForURL('**/thank-you*', { timeout: 10000 }), submit(page)]);
  await page.waitForTimeout(300);
  check(`${mode}: retry reuses the submission_id and is confirmed once`, st.posts.length === 2 && st.posts[1].params.submission_id === sid1 && named(st, 'generate_lead').length === 1 && named(st, 'conversion').length === 1);
  check(`${mode}: one lead reached the stand-ins`, st.world.telegram.length === 1, st.world.telegram.length);
  await ctx.close();
}

// ── 3. the server took the lead but the answer was lost: the retry is a duplicate, not a 2nd lead ─
for (const url of ['/', '/book-online']) {
  const { ctx, page, st } = await session();
  await page.goto(BASE + url, { waitUntil: 'load' });
  await openForm(page); await fill(page);
  st.mode = 'lost';
  await submit(page);
  await page.waitForSelector('.lead-send-error', { state: 'visible', timeout: 10000 });
  check(`${url} lost answer: the lead was stored, the page says it could not confirm`, st.world.telegram.length === 1 && !page.url().includes('thank-you'));
  st.mode = 'ok';
  await Promise.all([page.waitForURL('**/thank-you*', { timeout: 10000 }), submit(page)]);
  await page.waitForTimeout(300);
  check(`${url} lost answer: the retry is recognised (duplicate), still one lead, one conversion`, st.posts.length === 2 && st.posts[0].params.submission_id === st.posts[1].params.submission_id && st.world.telegram.length === 1 && st.world.sprotocol.length === 1 && named(st, 'conversion').length === 1 && named(st, 'generate_lead').length === 1);
  await ctx.close();
}

// ── 4. timeout ───────────────────────────────────────────────────────────────────────────────────
{
  const { ctx, page, st } = await session({ clock: true });
  await page.goto(BASE + '/aurora', { waitUntil: 'load' });
  await openForm(page); await fill(page);
  st.mode = 'hang';
  await submit(page);
  await page.waitForTimeout(300);
  await page.clock.runFor(26000);
  await page.waitForSelector('.lead-send-error', { state: 'visible', timeout: 10000 });
  check('timeout (no answer in 25 s): message, data kept, nothing counted', !page.url().includes('thank-you') && !named(st, 'conversion').length && (await formValues(page))[0] === 'Audit Test');
  st.mode = 'ok';
  await Promise.all([page.waitForURL('**/thank-you*', { timeout: 10000 }), submit(page)]);
  check('timeout: the retry is confirmed with the same submission_id', st.posts.length === 2 && st.posts[0].params.submission_id === st.posts[1].params.submission_id);
  await ctx.close();
}

// ── 5. double click / double submit ──────────────────────────────────────────────────────────────
{
  const { ctx, page, st } = await session();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await openForm(page); await fill(page);
  st.mode = 'delay';
  await Promise.all([
    page.waitForURL('**/thank-you*', { timeout: 10000 }),
    page.evaluate(() => { const f = document.getElementById('bookingForm'); const b = f.querySelector('button[type=submit]'); b.click(); b.click(); f.requestSubmit(); }),
  ]);
  check('double click + extra submit: one POST, one lead, one conversion', st.posts.length === 1 && st.world.telegram.length === 1 && named(st, 'conversion').length === 1, st.posts.length);
  await ctx.close();
  const s2 = await session();
  await s2.page.goto(BASE + '/book-online', { waitUntil: 'load' });
  await fill(s2.page);
  s2.st.mode = 'delay';
  await Promise.all([
    s2.page.waitForURL('**/thank-you*', { timeout: 10000 }),
    s2.page.evaluate(() => { const b = document.getElementById('confirmBookingBtn'); b.click(); b.click(); }),
  ]);
  check('/book-online double confirm: one POST', s2.st.posts.length === 1, s2.st.posts.length);
  await s2.ctx.close();
}

// ── 6. thank-you opened directly ─────────────────────────────────────────────────────────────────
{
  const { ctx, page, st } = await session();
  await page.goto(BASE + '/thank-you.html', { waitUntil: 'load' }); await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(200);
  check('thank-you opened directly and reloaded: no conversion, no generate_lead', !named(st, 'conversion').length && !named(st, 'generate_lead').length);
  await ctx.close();
}

// ── 7. attribution: kept across pages and both booking paths; direct / internal never erase it ────
async function attributionFor(steps, finalUrl) {
  const { ctx, page, st } = await session();
  for (const [url, referer] of steps) await page.goto(BASE + url, { waitUntil: 'load', referer });
  await page.goto(BASE + finalUrl, { waitUntil: 'load' });
  await openForm(page); await fill(page);
  await Promise.all([page.waitForURL('**/thank-you*', { timeout: 10000 }), submit(page)]);
  const a = JSON.parse(st.posts[0].params.attribution);
  await ctx.close();
  return a;
}
{
  const a = await attributionFor([
    ['/aurora?gclid=TESTGCLID123&utm_source=google&utm_medium=cpc&utm_campaign=denver_test', 'https://www.google.com/'],
    ['/denver-washer-not-filling', BASE + '/aurora'],
    ['/coupons', undefined],
  ], '/book');
  check('ad click, then internal and direct visits, then /book: first and last keep the click id', a.first.gclid === 'TESTGCLID123' && a.last && a.last.gclid === 'TESTGCLID123' && a.first.path === '/aurora' && a.first.utm_medium === 'cpc', JSON.stringify(a));
  check('internal referrer is never recorded as a source', !JSON.stringify(a).includes('127.0.0.1'));
}
{
  const a = await attributionFor([
    ['/', 'https://www.google.com/'],
    ['/aurora?utm_source=gbp&utm_medium=organic&utm_campaign=business-profile', undefined],
    ['/', undefined],
  ], '/book-online');
  check('Google organic first, explicit GBP tag later, direct return, /book-online: first = google referrer, last = gbp UTM', a.first.ref === 'www.google.com' && !a.first.gclid && a.last && a.last.utm_source === 'gbp' && !a.last.gclid, JSON.stringify(a));
}
{
  const a = await attributionFor([['/', 'https://www.google.com/']], '/aurora');
  check('a Google referral without paid evidence carries no click id or paid UTM (S Protocol files it as organic)', a.first.ref === 'www.google.com' && !a.first.gclid && !a.first.utm_medium, JSON.stringify(a));
}
{
  const a = await attributionFor([], '/');
  check('a direct visit posts a first touch with no source facts and no last touch', a.first && !a.first.ref && !a.first.gclid && !a.first.utm_source && a.last === null, JSON.stringify(a));
}

// ── 8. GA4 form events: header book_click, form_location, /book-online form start ────────────────
{
  const { ctx, page, st } = await session();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(() => { const a = document.querySelector('a.header-book-btn'); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
  const hb = named(st, 'book_click');
  check('header "Book Online - Save $25": one book_click {location: header}', hb.length === 1 && hb[0][2].location === 'header', JSON.stringify(hb));
  await page.click('.selector-btn');
  const ev = [...named(st, 'booking_step1_selected'), ...named(st, 'booking_form_view')];
  check('standard form start: booking_step1_selected + booking_form_view with form_location, no `source` param', ev.length === 2 && ev.every((e) => e[2].form_location === 'website-denver' && !('source' in e[2])), JSON.stringify(ev));
  await ctx.close();
}
{
  const { ctx, page, st } = await session();
  await page.goto(BASE + '/book-online', { waitUntil: 'load' });
  await page.focus('#name'); await page.focus('#phone');
  await page.selectOption('#service', { index: 1 });
  const v = named(st, 'booking_form_view'), s = named(st, 'booking_step1_selected');
  check('/book-online form start: booking_form_view once on first interaction, booking_step1_selected on the appliance, form_location book_online', v.length === 1 && s.length === 1 && v[0][2].form_location === 'book_online' && s[0][2].form_location === 'book_online' && !('source' in v[0][2]) && s[0][2].appliance, JSON.stringify([v, s]));
  await ctx.close();
}

// ── 9. no personal data in any analytics event ───────────────────────────────────────────────────
{
  const bad = allEvents.map((d) => d.item).filter((i) => i[0] === 'event' && i[1] !== 'conversion')
    .filter((i) => PII.some((x) => JSON.stringify(i).includes(x)));
  const adsOnly = allEvents.map((d) => d.item).filter((i) => i[0] === 'event' && i[2] && i[2].user_data).every((i) => i[1] === 'conversion' && String(i[2].send_to).startsWith('AW-'));
  check('no name, phone, address, email or message in any GA4 event', bad.length === 0, JSON.stringify(bad.slice(0, 2)));
  check('user_data appears only on the unchanged Ads conversion (send_to AW-...)', adsOnly);
}

await browser.close();
server.close();
let failed = 0;
for (const r of results) { if (!r.ok) failed++; console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok ? '' : `  (${r.detail})`}`); }
console.log(failed ? `\nFAIL - ${failed} of ${results.length} lead-flow checks` : `\nPASS - ${results.length} lead-flow checks (local stand-ins; production unverified).`);
process.exit(failed ? 1 : 0);
