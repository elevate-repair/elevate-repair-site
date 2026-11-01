/**
 * Elevate Repair DENVER - confirmed lead receipt for the website forms.
 * =====================================================================
 * NOT DEPLOYED BY THIS REPOSITORY. Both live Denver Apps Script projects - "webhook" (the standard form
 * endpoint AKfycbzCuzqt...7Q/exec) and "Book in one click" (the Book-It-Now endpoint AKfycbxQ12NI...fQ/exec)
 * - carry the code below verbatim as their "CONFIRMED LEAD RECEIPT" section. A change here is pasted into
 * EACH of them by hand and deployed as a NEW VERSION OF THE SAME DEPLOYMENT, so the /exec URLs stay the same.
 * tools/qa-lead-ack.mjs tests it, one request at a time and with concurrent requests, against stand-ins for
 * Telegram, the Sheet and S Protocol.
 *
 * Where it plugs into each script (already in place in both): `handleLead_` is the original doPost. It takes
 * its lead id from ackLeadId_() (falling back to the old random id without a submission_id), reports it with
 * ackLead_, calls ackReject_(<reason>) in each rejection branch and ackDelivery_(<channel>, ok) after
 * Telegram, S Protocol (ok = sprotocolStored_(answer)) and the Sheet, and adds market "denver",
 * attributionField_(data.attribution) and submissionId: ackSubmissionId_() to the S Protocol payload.
 *
 * Deliveries no longer run under one script-wide lock (see "Concurrency" below), so queue runs of the
 * delayed customer SMS can overlap. In both scripts each due SMS is LEASED under the lock before it is
 * sent (leasePendingSms_) and only removed after Quo answered 2xx (settlePendingSms_): overlapping runs
 * skip a leased SMS, a failed send is retried with back-off, a run that died mid-send is resumed after
 * the lease expires, and a definite rejection or the 5th failed attempt is kept as failed_sms_<leadId>.
 * Delivery is at-least-once: when the outcome is unknown (Quo accepted it but the answer was lost, or the
 * run died after Quo accepted it) the retry can send the SMS a second time.
 */

/******************** CONFIRMED LEAD RECEIPT (elevaterepair.com PR #238) ********************/
// The website counts a lead as received ONLY when this endpoint answers JSON
//   {"ok": true, "submission_id": "<the submission_id the page sent>"}.
// ok:true  = the request passed this script's own validation AND at least one of Telegram,
//            S-Protocol (an answer of {"ok":true} or {"deduplicated":true}) or the Sheet took it.
//            A 200 from S-Protocol with {"skipped":...} is NOT stored. The customer SMS queue does not count.
// ok:false = rejected (reason = this script's rejection key), "not_delivered" (nothing took it: the page keeps
//            the form and the visitor can resend with the same id), "busy" (lock timeout) or "in_progress"
//            (the same submission is still being delivered by another request; resending later answers duplicate).
// duplicate:true = this submission_id was already confirmed in the last 6 h; nothing is sent again.
// Field mapping: site -> script "submission_id"; script -> site "submission_id" + "lead_id";
//                script -> S-Protocol "submissionId" + "leadId" (S-Protocol dedups by leadId).
// leadId for a request WITH submission_id is derived from it (same id -> same leadId), so even if the cache
// entry is lost, S-Protocol answers {"deduplicated":true} instead of creating a second lead.
// Callers WITHOUT a valid submission_id (old pages, manual tests) get the old plain-text answer, unchanged.
//
// Concurrency: the script lock guards only the per-submission state change (claim, a few cache calls),
// never the deliveries, so two visitors are delivered side by side instead of one waiting for the other.
// State per submission_id in the script cache: "inflight:<ms>" while one request delivers it,
// "done:<leadId>" once confirmed (an older plain "<leadId>" entry also counts as done); a rejected or
// undelivered request removes its claim so the visitor's resend is processed normally.
// Timing contract with the site (tools/lead-capture/lead-send.js TIMEOUT_MS = 25 s):
//   claim wait (ACK_LOCK_WAIT_MS_ 5 s) + wait for an in-flight copy (ACK_INFLIGHT_WAIT_MS_ 15 s)
//   + Apps Script redirect / network (~1 s measured) < 25 s,
// so a resend that finds its submission still being delivered gets that delivery's result before the page
// gives up. It is never answered ok before a channel took the lead.
var ACK_ = null;
var ACK_CACHE_PREFIX_ = "er_sub_";
var ACK_CACHE_TTL_S_ = 21600;       // 6 h (CacheService maximum)
var ACK_LOCK_WAIT_MS_ = 5000;       // claim only: a few cache calls under the lock
var ACK_INFLIGHT_WAIT_MS_ = 15000;  // a resend waits this long for the copy that is still delivering
var ACK_INFLIGHT_TTL_S_ = 360;      // Apps Script's 6-minute execution limit: an older claim belongs to a dead run
var ACK_POLL_MS_ = 500;

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
/** S-Protocol stored the lead (or already had it). A 200 with {"skipped": ...} is NOT stored. */
function sprotocolStored_(sp) {
  if (!sp || !sp.ok) return false;
  try {
    var b = JSON.parse(sp.body || "{}");
    return !!b && (b.ok === true || b.deduplicated === true);
  } catch (err) { return false; }
}
/** Stable 8-char lead id for the current submission_id ("" when there is none). */
function ackLeadId_() {
  if (!ACK_ || !ACK_.submissionId) return "";
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, "er-lead:" + ACK_.submissionId, Utilities.Charset.UTF_8);
  var hex = "";
  for (var i = 0; i < 4; i++) hex += ("0" + (d[i] & 255).toString(16)).slice(-2);
  return hex.toUpperCase();
}
function ackLead_(leadId) { if (ACK_) ACK_.leadId = String(leadId || ""); }
function ackReject_(reason) { if (ACK_) ACK_.rejected = String(reason || "rejected"); }
function ackDelivery_(channel, ok) { if (ACK_) (ok ? ACK_.delivered : ACK_.failed).push(channel); }
function ackSubmissionId_() { return ACK_ ? ACK_.submissionId : ""; }

/** {state: "none" | "inflight" | "done", leadId} of a submission_id in the script cache. */
function ackState_(cache, sid) {
  var v = cache.get(ACK_CACHE_PREFIX_ + sid);
  if (!v) return { state: "none" };
  if (v.indexOf("inflight:") === 0) {
    var since = Number(v.slice(9)) || 0;
    return Date.now() - since < ACK_INFLIGHT_TTL_S_ * 1000 ? { state: "inflight" } : { state: "none" };
  }
  return { state: "done", leadId: v.indexOf("done:") === 0 ? v.slice(5) : v };
}
/** Under the lock: "done" / "inflight" as found, otherwise mark it in flight and answer "claimed". */
function ackClaim_(sid) {
  var lock = null;
  try {
    lock = LockService.getScriptLock();
    lock.waitLock(ACK_LOCK_WAIT_MS_);
  } catch (err) {
    Logger.log("[ack] lock not acquired sid=" + sid + ": " + err);
    return { state: "busy" };
  }
  try {
    var cache = CacheService.getScriptCache();
    var s = ackState_(cache, sid);
    if (s.state !== "none") return s;
    cache.put(ACK_CACHE_PREFIX_ + sid, "inflight:" + Date.now(), ACK_INFLIGHT_TTL_S_);
    return { state: "claimed" };
  } catch (err) {
    Logger.log("[ack] cache unavailable (S-Protocol still dedups by leadId): " + err);
    return { state: "claimed" };
  } finally {
    try { lock.releaseLock(); } catch (err) { /* already released */ }
  }
}
/** A copy of this submission is being delivered: wait for its result, or take over if it gave up. */
function ackAwait_(sid) {
  var deadline = Date.now() + ACK_INFLIGHT_WAIT_MS_;
  while (Date.now() < deadline) {
    Utilities.sleep(ACK_POLL_MS_);
    var s = null;
    try { s = ackState_(CacheService.getScriptCache(), sid); } catch (err) { return { state: "inflight" }; }
    if (s.state === "done") return s;
    if (s.state === "none") return ackClaim_(sid); // that copy was rejected / not delivered
  }
  return { state: "inflight" };
}
function ackFinish_(sid, leadId) {
  try { CacheService.getScriptCache().put(ACK_CACHE_PREFIX_ + sid, "done:" + (leadId || "accepted"), ACK_CACHE_TTL_S_); }
  catch (err) { Logger.log("[ack] cache put failed: " + err); }
}
function ackRelease_(sid) {
  try { CacheService.getScriptCache().remove(ACK_CACHE_PREFIX_ + sid); }
  catch (err) { Logger.log("[ack] cache remove failed: " + err); }
}

function doPost(e) {
  var params = parseIncoming_(e) || {};
  var sid = ackClean_(params.submission_id);
  if (!sid) return handleLead_(e); // no id: the old contract, answered exactly as before

  var claim = ackClaim_(sid);
  if (claim.state === "inflight") claim = ackAwait_(sid);
  if (claim.state === "busy") return ackJson_({ ok: false, submission_id: sid, reason: "busy" });
  if (claim.state === "done") {
    Logger.log("[ack] duplicate sid=" + sid + " lead=" + claim.leadId + " - nothing sent");
    return ackJson_({ ok: true, duplicate: true, submission_id: sid, lead_id: claim.leadId });
  }
  if (claim.state !== "claimed") {
    Logger.log("[ack] still in progress sid=" + sid + " - nothing sent");
    return ackJson_({ ok: false, submission_id: sid, reason: "in_progress" });
  }

  ACK_ = { submissionId: sid, leadId: "", rejected: "", delivered: [], failed: [] };
  try {
    handleLead_(e);
  } catch (err) {
    Logger.log("[ack] handler error: " + err);
  }
  var a = ACK_;
  ACK_ = null;
  Logger.log("[ack] sid=" + sid + " lead=" + a.leadId + " rejected=" + (a.rejected || "-") +
    " delivered=" + (a.delivered.join(",") || "-") + " failed=" + (a.failed.join(",") || "-"));
  if (a.rejected) {
    ackRelease_(sid);
    return ackJson_({ ok: false, submission_id: sid, reason: a.rejected });
  }
  if (!a.delivered.length) {
    ackRelease_(sid);
    return ackJson_({ ok: false, submission_id: sid, reason: "not_delivered" });
  }
  ackFinish_(sid, a.leadId);
  return ackJson_({ ok: true, submission_id: sid, lead_id: a.leadId });
}
