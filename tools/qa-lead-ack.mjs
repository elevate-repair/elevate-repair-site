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
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'tools', 'lead-capture', 'denver-lead-ack.gs'), 'utf8');

/** A reference Denver handler with the documented edit points (see the .gs header, step 3-4). */
const REFERENCE_HANDLER = `
function handleLead_(e) {
  var data = e.parameter || {};
  var leadId = Utilities.getUuid().slice(0, 8).toUpperCase();
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
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, String(v)) }) },
    Utilities: { getUuid: () => `${(++uuid).toString(16).padStart(8, '0')}-0000-4000-8000-000000000000` },
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

let failed = 0;
for (const r of results) { if (!r.ok) failed++; console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok || !r.detail ? '' : `  (${r.detail})`}`); }
console.log(failed ? `\nFAIL - ${failed} of ${results.length} Apps Script receipt checks` : `\nPASS - ${results.length} Apps Script receipt checks (reference handler; the live scripts still need the manual paste).`);
process.exit(failed ? 1 : 0);
}
