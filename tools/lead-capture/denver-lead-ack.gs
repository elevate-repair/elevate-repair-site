/**
 * Elevate Repair DENVER - confirmed lead receipt for the website forms.
 * =====================================================================
 * NOT DEPLOYED BY THIS REPOSITORY. The live Denver Apps Script projects (the standard form endpoint
 * AKfycbzCuzqt...7Q/exec and the Book-It-Now endpoint AKfycbxQ12NI...fQ/exec) are not in any
 * repository; this file is the change to paste into EACH of them by hand, then deploy a NEW VERSION
 * OF THE SAME DEPLOYMENT so the /exec URL stays the same. tools/qa-lead-ack.mjs tests it against
 * stand-ins for Telegram, the Sheet and S Protocol.
 *
 * Why: the website now counts a request as received only when the endpoint answers
 *   {"ok": true, "submission_id": "<the id the page sent>"}
 * (tools/lead-capture/lead-send.js). The current scripts answer plain "ok" whatever happened, so the
 * site cannot tell a stored lead from a failed one.
 *
 * What stays exactly as it is: the endpoint URLs, every incoming field, validation, priority and
 * flags, the Telegram text, the Sheet columns, the S Protocol payload fields, auto-SMS, and the
 * answer to any caller that sends no submission_id (old pages, the manual test functions).
 *
 * ── HOW TO APPLY (each Denver script) ─────────────────────────────────────────────────────────────
 *  1. Paste this whole file below the existing code.
 *  2. Rename the existing `function doPost(e) {` to `function handleLead_(e) {`. Nothing else in its
 *     body moves; `doPost` below now wraps it.
 *  3. Inside handleLead_, add one line at each point (the names are the ones the Buffalo template
 *     tools/buffalo-lead-handler.gs uses; the Denver script was its original):
 *       after the lead id is made:          ackLead_(leadId);
 *       in each rejection branch, before
 *       its `return`:                        ackReject_("honeypot");  ackReject_("blocked_link");
 *                                            ackReject_("invalid_phone");
 *       after the Telegram send:             ackDelivery_("telegram", tg.ok);
 *       after the S Protocol send:           ackDelivery_("sprotocol", sprotocolStored_(sp));
 *       after appendToSheet_ succeeds:       ackDelivery_("sheet", true);
 *       in that append's catch:              ackDelivery_("sheet", false);
 *  4. In the payload sent to S Protocol (buildSProtocolPayload_ or its inline equivalent) add:
 *       market: "denver",
 *       attribution: attributionField_(data.attribution),
 *       submissionId: ackSubmissionId_()
 *     `market` makes S Protocol file the lead in the Denver market instead of relying on its
 *     default; `attribution` is the site's raw first / last touch, classified by S Protocol
 *     (public.ingest_website_attribution); neither is ever written to Telegram or the Sheet.
 *
 * ── WHAT "RECEIVED" MEANS ─────────────────────────────────────────────────────────────────────────
 * ok:true only when the request passed validation AND at least one of Telegram, S Protocol (an answer
 * of {"ok":true} or {"deduplicated":true}) or the Sheet took it - a person will see it. A rejected
 * request answers ok:false with the reason; if nothing took it, ok:false "not_delivered" (the site
 * keeps the form filled in and the visitor can send again). A confirmed submission_id is remembered
 * for 6 hours: the same id again (a retry after a lost answer, a double click that slipped through)
 * answers ok:true, duplicate:true and sends nothing a second time. The script lock makes two
 * simultaneous copies of one submission wait for each other instead of both sending.
 */

var ACK_ = null;

function ackJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function ackClean_(v) {
  var s = v == null ? "" : String(v).trim();
  return /^[A-Za-z0-9-]{16,64}$/.test(s) ? s : "";
}
/** The site's raw attribution facts: forwarded as-is when they are a JSON object of a sane size. */
function attributionField_(raw) {
  var s = typeof raw === "string" ? raw : "";
  if (!s || s.length > 8000) return "";
  try {
    var v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? s : "";
  } catch (err) { return ""; }
}
/** S Protocol stored the lead (or already had it). A 200 with {"skipped": ...} is NOT stored. */
function sprotocolStored_(sp) {
  if (!sp || !sp.ok) return false;
  try {
    var b = JSON.parse(sp.body || "{}");
    return b.ok === true || b.deduplicated === true;
  } catch (err) { return false; }
}

function ackLead_(leadId)           { if (ACK_) ACK_.leadId = String(leadId || ""); }
function ackReject_(reason)         { if (ACK_) ACK_.rejected = String(reason || "rejected"); }
function ackDelivery_(channel, ok)  { if (ACK_) (ok ? ACK_.delivered : ACK_.failed).push(channel); }
function ackSubmissionId_()         { return ACK_ ? ACK_.submissionId : ""; }

function doPost(e) {
  var params = (e && e.parameter) || {};
  var sid = ackClean_(params.submission_id);
  if (!sid) return handleLead_(e);   // no id: the old contract, answered exactly as before

  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return ackJson_({ ok: false, submission_id: sid, reason: "busy" }); }
  try {
    var cache = CacheService.getScriptCache();
    var seen = cache.get("er_sub_" + sid);
    if (seen) return ackJson_({ ok: true, duplicate: true, submission_id: sid, lead_id: seen });

    ACK_ = { submissionId: sid, leadId: "", rejected: "", delivered: [], failed: [] };
    try {
      handleLead_(e);
    } catch (err) {
      Logger.log("[ack] handler error: " + err);
    }
    var a = ACK_;
    if (a.rejected) return ackJson_({ ok: false, submission_id: sid, reason: a.rejected });
    if (!a.delivered.length) return ackJson_({ ok: false, submission_id: sid, reason: "not_delivered" });
    cache.put("er_sub_" + sid, a.leadId || "accepted", 21600);
    return ackJson_({ ok: true, submission_id: sid, lead_id: a.leadId });
  } finally {
    ACK_ = null;
    lock.releaseLock();
  }
}
