#!/usr/bin/env node
/**
 * Tests tools/lead-capture/denver-lead-ack.gs - the confirmed-receipt change for the Denver Apps
 * Scripts - against stand-ins for Telegram, S Protocol and the Sheet. Pure Node, nothing leaves
 * the machine; runs in CI.
 *
 *   node tools/qa-lead-ack.mjs
 *
 * The live Denver scripts are not in any repository, so `handleLead_` below is a REFERENCE of their
 * shape: the fields S Protocol receives from Denver today (leads.raw_source_note.raw_payload holds
 * exactly name, phone, address, appliance, message, source, leadId, priority, flags, dispatcherNote,
 * smsTemplate, telegramText) with the one-line edits the .gs file asks for. It proves the wrapper's
 * behaviour, not the live script: that is still a manual paste plus one controlled end-to-end test.
 *
 * Section 10 runs requests concurrently, each in its own thread that blocks on the script lock, the
 * cache and the channels the way an Apps Script execution does, and checks the timing contract
 * between the claim / in-flight waits in the .gs and the page's TIMEOUT_MS in lead-send.js.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Worker, MessageChannel } from 'node:worker_threads';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'tools', 'lead-capture', 'denver-lead-ack.gs'), 'utf8');

/** A reference Denver handler with the documented edit points (see the .gs header, step 3-4). */
const REFERENCE_HANDLER = `
function parseIncoming_(e) { return (e && e.parameter) || {}; }
function handleLead_(e) {
  var data = e.parameter || {};
  var leadId = ackLeadId_() || Utilities.getUuid().slice(0, 8).toUpperCase();
  ackLead_(leadId);
  var phone = String(data.phone || "").replace(/[^\\d+]/g, "");
  if (String(data.website || "").trim()) { ackReject_("honeypot"); return ContentService.createTextOutput("rejected"); }
  if (/https?:\\/\\//i.test(String(data.message || ""))) { ackReject_("blocked_link"); return ContentService.createTextOutput("rejected"); }
  var d = phone.replace(/\\D/g, ""); if (d.length === 11 && d[0] === "1") d = d.slice(1);
  if (/^(\\d)\\1{9}$/.test(d) || !/^[2-9]\\d{2}[2-9]\\d{6}$/.test(d)) { ackReject_("invalid_phone"); return ContentService.createTextOutput("rejected: invalid phone"); }
  var tg = sendTelegram_("DENVER WEBSITE LEAD " + leadId);
  ackDelivery_("telegram", tg.ok);
  var sp = sendToSProtocol_({
    leadId: leadId, name: data.name, phone: phone, address: data.address,
    appliance: data.appliance || data.service, message: data.message, source: data.source || "website-denver",
    priority: "HIGH", flags: "NONE", dispatcherNote: "CALL", smsTemplate: "Hi", telegramText: "DENVER WEBSITE LEAD",
    market: "denver",
    attribution: attributionField_(data.attribution),
    submissionId: ackSubmissionId_()
  });
  ackDelivery_("sprotocol", sprotocolStored_(sp));
  try { appendToSheet_([leadId, data.name, phone, data.source]); ackDelivery_("sheet", true); }
  catch (err) { ackDelivery_("sheet", false); }
  if (WORLD.throwAfterDelivery) throw new Error("late failure");
  return ContentService.createTextOutput("ok");
}`;

export function makeWorld() {
  const world = { telegram: [], sprotocol: [], sheet: [], tgOk: true, spAnswer: '{"ok":true,"id":"x","lead_id":"x"}', spCode: 200, sheetThrows: false, throwAfterDelivery: false };
  const cache = new Map();
  let uuid = 0;
  const ctx = {
    WORLD: world,
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: (t) => ({ text: t, mime: 'text/plain', setMimeType(m) { this.mime = m; return this; }, getContent() { return this.text; } }),
    },
    LockService: { getScriptLock: () => ({ held: false, waitLock() { this.held = true; }, releaseLock() { this.held = false; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, String(v)), remove: (k) => cache.delete(k) }) },
    Utilities: {
      getUuid: () => `${(++uuid).toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`,
      sleep: () => {},
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(createHash(alg).update(String(s), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
    },
    Logger: { log: () => {} },
    sendTelegram_: (text) => { world.telegram.push(text); return { ok: world.tgOk }; },
    sendToSProtocol_: (payload) => { world.sprotocol.push(payload); return { ok: world.spCode >= 200 && world.spCode < 300, code: world.spCode, body: world.spAnswer }; },
    appendToSheet_: (row) => { if (world.sheetThrows) throw new Error('sheet down'); world.sheet.push(row); },
  };
  vm.createContext(ctx);
  vm.runInContext(REFERENCE_HANDLER + '\n' + GS, ctx);
  const post = (params) => {
    const out = ctx.doPost({ parameter: params });
    let json = null;
    try { json = JSON.parse(out.getContent()); } catch { /* text answer */ }
    return { text: out.getContent(), mime: out.mime, json };
  };
  return { world, post };
}

const isMain = process.argv[1] && process.argv[1].endsWith('qa-lead-ack.mjs');
if (isMain) {
const LEAD = { name: 'Audit Test', phone: '(720) 555-0134', address: '100 Test St, Denver, CO', service: 'Washer Repair', message: 'test', source: 'website-aurora', website: '' };
const SID = '6f1d3c1e-0c4b-4c55-9e5d-6a1d2b3c4d5e';
const ATTR = JSON.stringify({ v: 1, first: { ts: '2026-11-01T00:00:00.000Z', path: '/aurora', gclid: 'TESTGCLID123' }, last: null });

const results = [];
const check = (name, cond, detail = '') => { results.push({ name, ok: !!cond, detail }); };

{ // 1. confirmed receipt
  const { world, post } = makeWorld();
  const r = post({ ...LEAD, submission_id: SID, attribution: ATTR });
  check('confirmed: ok:true echoes the submission_id with a JSON mime type', r.json && r.json.ok === true && r.json.submission_id === SID && r.mime === 'application/json', r.text);
  check('confirmed: one Telegram, one S Protocol, one Sheet row', world.telegram.length === 1 && world.sprotocol.length === 1 && world.sheet.length === 1);
  const p = world.sprotocol[0];
  check('S Protocol payload: market denver, attribution relayed verbatim, submissionId, source unchanged', p.market === 'denver' && p.attribution === ATTR && p.submissionId === SID && p.source === 'website-aurora' && p.appliance === 'Washer Repair');
  // 2. the same submission again (retry after a lost answer / slipped double click)
  const again = post({ ...LEAD, submission_id: SID, attribution: ATTR });
  check('retry of a confirmed submission: ok:true duplicate:true, nothing sent again', again.json && again.json.ok === true && again.json.duplicate === true && again.json.submission_id === SID && world.telegram.length === 1 && world.sprotocol.length === 1 && world.sheet.length === 1, again.text);
  // a different submission is a new lead
  const other = post({ ...LEAD, submission_id: SID.replace('6f1d', '7a2e') });
  check('a different submission_id is a new lead', other.json && other.json.ok === true && !other.json.duplicate && world.telegram.length === 2);
}
{ // 3. one channel down is still received
  const { world, post } = makeWorld();
  world.tgOk = false;
  const r = post({ ...LEAD, submission_id: SID });
  check('Telegram down, S Protocol stored: still ok:true', r.json && r.json.ok === true, r.text);
}
{ // 4. nothing took it -> not received; a later retry is processed normally
  const { world, post } = makeWorld();
  world.tgOk = false; world.spAnswer = '{"skipped":true,"reason":"no_token"}'; world.sheetThrows = true;
  const r = post({ ...LEAD, submission_id: SID });
  check('every channel failed (S Protocol "skipped" is not stored): ok:false not_delivered', r.json && r.json.ok === false && r.json.reason === 'not_delivered' && r.json.submission_id === SID, r.text);
  world.tgOk = true; world.spAnswer = '{"ok":true}'; world.sheetThrows = false;
  const r2 = post({ ...LEAD, submission_id: SID });
  check('retry after not_delivered is processed (failures are not remembered)', r2.json && r2.json.ok === true && !r2.json.duplicate && world.telegram.length === 2, r2.text);
}
{ // 5. S Protocol 500 + Telegram ok
  const { world, post } = makeWorld();
  world.spCode = 500; world.spAnswer = 'Internal Server Error';
  const r = post({ ...LEAD, submission_id: SID });
  check('S Protocol HTTP 500 but Telegram + Sheet took it: ok:true', r.json && r.json.ok === true, r.text);
}
{ // 6. rejections
  const { world, post } = makeWorld();
  const hp = post({ ...LEAD, website: 'bot', submission_id: SID });
  const ph = post({ ...LEAD, phone: '2222222222', submission_id: SID });
  const ln = post({ ...LEAD, message: 'see http://spam.example', submission_id: SID });
  check('honeypot / invalid phone / link: ok:false with the reason, nothing sent', hp.json?.reason === 'honeypot' && ph.json?.reason === 'invalid_phone' && ln.json?.reason === 'blocked_link' && [hp, ph, ln].every((x) => x.json.ok === false) && world.telegram.length === 0 && world.sprotocol.length === 0);
  const after = post({ ...LEAD, submission_id: SID });
  check('a rejected id is not remembered: the corrected request goes through', after.json && after.json.ok === true && !after.json.duplicate);
}
{ // 7. no submission_id: the old contract, unchanged
  const { world, post } = makeWorld();
  const r = post({ ...LEAD });
  check('no submission_id: plain "ok" text exactly as before, lead still sent', r.text === 'ok' && r.json === null && world.telegram.length === 1 && world.sprotocol[0].submissionId === '', r.text);
  const bad = post({ ...LEAD, submission_id: 'short' });
  check('malformed submission_id is ignored (old contract)', bad.text === 'ok');
}
{ // 8. a late error after delivery still counts as received
  const { world, post } = makeWorld();
  world.throwAfterDelivery = true;
  const r = post({ ...LEAD, submission_id: SID });
  check('error after the lead was delivered: ok:true', r.json && r.json.ok === true, r.text);
}
{ // 9. attribution hygiene
  const { world, post } = makeWorld();
  post({ ...LEAD, submission_id: SID, attribution: 'x'.repeat(9000) });
  post({ ...LEAD, submission_id: SID.replace('6f1d', '1111'), attribution: '[1,2]' });
  check('oversized or non-object attribution is dropped, the lead is not', world.sprotocol.length === 2 && world.sprotocol.every((p) => p.attribution === ''));
}

// 10. Concurrent requests. Each request runs in its own thread and blocks on the lock, the cache and
//     the stand-in channels exactly like an Apps Script execution does (synchronous calls into this thread).
{
  const timeoutMs = Number((readFileSync(join(ROOT, 'tools', 'lead-capture', 'lead-send.js'), 'utf8').match(/TIMEOUT_MS\s*=\s*(\d+)/) || [])[1]);
  const gsConst = (name) => Number((GS.match(new RegExp('var ' + name + '\\s*=\\s*(\\d+)')) || [])[1]);
  const lockWait = gsConst('ACK_LOCK_WAIT_MS_'), inflightWait = gsConst('ACK_INFLIGHT_WAIT_MS_');
  check(`timing contract: claim wait ${lockWait} ms + in-flight wait ${inflightWait} ms + 3000 ms redirect/network margin fits the page's ${timeoutMs} ms`,
    timeoutMs > 0 && lockWait > 0 && inflightWait > 0 && lockWait + inflightWait + 3000 <= timeoutMs);

  const DELAY = { telegram: 200, sprotocol: 1500, sheet: 300 };
  const SID2 = SID.replace('6f1d', '8b3f');
  const world = { telegram: [], sprotocol: [], sheet: [], leads: new Set() };
  const lock = { owner: null, queue: [] };
  const cache = new Map();
  const release = (id) => {
    if (lock.owner !== id) return;
    lock.owner = null;
    const w = lock.queue.shift();
    if (w) { clearTimeout(w.timer); lock.owner = w.id; w.reply(true); }
  };
  const handle = (id, op, a, reply) => {
    if (op === 'lock') {
      if (!lock.owner || lock.owner === id) { lock.owner = id; return reply(true); }
      const w = { id, reply };
      w.timer = setTimeout(() => { lock.queue.splice(lock.queue.indexOf(w), 1); reply(false); }, a.ms);
      return lock.queue.push(w);
    }
    if (op === 'unlock') { release(id); return reply(null); }
    if (op === 'get') return reply(cache.has(a.k) ? cache.get(a.k) : null);
    if (op === 'put') { cache.set(a.k, a.v); return reply(null); }
    if (op === 'remove') { cache.delete(a.k); return reply(null); }
    if (op === 'send') {
      return setTimeout(() => {
        if (a.ch === 'sprotocol') {
          const dup = world.leads.has(a.data.leadId);
          world.leads.add(a.data.leadId); world.sprotocol.push(a.data);
          return reply(dup ? { ok: true, code: 200, body: '{"deduplicated":true}' } : { ok: true, code: 200, body: '{"ok":true}' });
        }
        world[a.ch].push(a.data);
        return reply({ ok: true });
      }, DELAY[a.ch]);
    }
    return reply(null);
  };
  const WORKER = `
    const { workerData, parentPort, receiveMessageOnPort } = require('node:worker_threads');
    const vm = require('node:vm'); const { createHash } = require('node:crypto');
    const { code, params, sab, port } = workerData; const flag = new Int32Array(sab);
    const rpc = (op, args) => { Atomics.store(flag, 0, 0); port.postMessage({ op, args });
      for (;;) { Atomics.wait(flag, 0, 0, 60000); const m = receiveMessageOnPort(port); if (m) return m.message; } };
    const out = (t) => ({ t, m: 'text/plain', setMimeType(x) { this.m = x; return this; }, getContent() { return this.t; } });
    const ctx = { WORLD: {}, Logger: { log() {} },
      ContentService: { MimeType: { JSON: 'application/json', TEXT: 'text/plain' }, createTextOutput: out },
      LockService: { getScriptLock: () => ({ waitLock(ms) { if (!rpc('lock', { ms })) throw new Error('Lock timeout'); }, releaseLock() { rpc('unlock', {}); } }) },
      CacheService: { getScriptCache: () => ({ get: (k) => rpc('get', { k }), put: (k, v) => rpc('put', { k, v: String(v) }), remove: (k) => rpc('remove', { k }) }) },
      Utilities: { getUuid: () => require('node:crypto').randomUUID(), sleep: (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
        DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
        computeDigest: (a, s) => Array.from(createHash(a).update(String(s), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)) },
      sendTelegram_: (text) => rpc('send', { ch: 'telegram', data: text }),
      sendToSProtocol_: (payload) => rpc('send', { ch: 'sprotocol', data: payload }),
      appendToSheet_: (row) => { rpc('send', { ch: 'sheet', data: row }); } };
    vm.createContext(ctx); vm.runInContext(code, ctx);
    const t0 = Date.now(); const text = ctx.doPost({ parameter: params }).getContent();
    parentPort.postMessage({ text, ms: Date.now() - t0 });`;
  let seq = 0;
  const run = (params) => new Promise((resolve, reject) => {
    const id = ++seq, sab = new SharedArrayBuffer(4), flag = new Int32Array(sab);
    const { port1, port2 } = new MessageChannel();
    const w = new Worker(WORKER, { eval: true, workerData: { code: REFERENCE_HANDLER + '\n' + GS, params, sab, port: port1 }, transferList: [port1] });
    port2.on('message', (m) => handle(id, m.op, m.args, (res) => { port2.postMessage(res); Atomics.store(flag, 0, 1); Atomics.notify(flag, 0); }));
    w.on('message', (r) => { release(id); port2.close(); let json = null; try { json = JSON.parse(r.text); } catch { /* text */ } resolve({ ...r, json }); });
    w.on('error', reject);
  });
  const one = DELAY.telegram + DELAY.sprotocol + DELAY.sheet;

  const [a, b] = await Promise.all([run({ ...LEAD, submission_id: SID }), run({ ...LEAD, submission_id: SID2 })]);
  check('concurrent: two visitors at once are both confirmed, with different lead ids', a.json?.ok === true && b.json?.ok === true && !a.json.duplicate && !b.json.duplicate && a.json.lead_id !== b.json.lead_id, `${a.text} | ${b.text}`);
  check('concurrent: each of the two leads reached Telegram, S Protocol and the Sheet exactly once', world.telegram.length === 2 && world.sprotocol.length === 2 && world.sheet.length === 2 && world.leads.size === 2);
  check(`concurrent: delivered side by side, not one after the other (${a.ms} / ${b.ms} ms, one delivery = ${one} ms)`, Math.max(a.ms, b.ms) < 2 * one - 300);

  const SID3 = SID.replace('6f1d', '9c4a');
  const [c, d] = await Promise.all([run({ ...LEAD, submission_id: SID3 }), run({ ...LEAD, submission_id: SID3 })]);
  check('concurrent: the same submission twice at once -> one ok, one ok duplicate, same lead id', [c, d].every((x) => x.json?.ok === true && x.json.submission_id === SID3) && [c, d].filter((x) => x.json.duplicate).length === 1 && c.json.lead_id === d.json.lead_id, `${c.text} | ${d.text}`);
  check('concurrent: ... and it was delivered once', world.telegram.length === 3 && world.sheet.length === 3 && world.leads.size === 3 && world.sprotocol.length === 3);

  const SID4 = SID.replace('6f1d', 'ad5b');
  const first = run({ ...LEAD, submission_id: SID4 });
  await new Promise((r) => setTimeout(r, 400));
  const resend = await run({ ...LEAD, submission_id: SID4 });
  const firstDone = await first;
  check('concurrent: a resend while the first copy is still delivering waits for it and answers duplicate', firstDone.json?.ok === true && resend.json?.ok === true && resend.json.duplicate === true && resend.json.lead_id === firstDone.json.lead_id, `${firstDone.text} | ${resend.text}`);
  check('concurrent: ... nothing sent twice', world.telegram.length === 4 && world.sheet.length === 4 && world.sprotocol.length === 4);
}

let failed = 0;
for (const r of results) { if (!r.ok) failed++; console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok || !r.detail ? '' : `  (${r.detail})`}`); }
console.log(failed ? `\nFAIL - ${failed} of ${results.length} Apps Script receipt checks` : `\nPASS - ${results.length} Apps Script receipt checks (reference handler; the live scripts still need the manual paste).`);
process.exit(failed ? 1 : 0);
}
