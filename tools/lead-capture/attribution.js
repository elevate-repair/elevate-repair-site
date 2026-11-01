/* Elevate Repair Denver - first-party marketing attribution (S Protocol ATTR-2).
 * Rendered inline into every page by tools/apply-lead-capture.mjs; edit this file, never a page.
 *
 * Records RAW facts only - Google click ids (gclid, gbraid, wbraid), fbclid, UTM parameters, the
 * referring HOST and the landing PATH - never a source label: S Protocol classifies them on its
 * server (attribution_classify_web_touch). Two touches, about 90 days, in this site's own
 * localStorage:
 *   first - the first visit seen (kept while it lives, never overwritten);
 *   last  - the latest NON-DIRECT visit (a click id, a UTM or an external referrer). A direct or
 *           internal visit never erases it.
 * Google Business Profile is only what an explicit UTM says (utm_source=gbp / gmb): Denver has no
 * confirmed GBP entry route, so nothing is inferred from a path. A Google referrer without paid
 * evidence stays a referrer; S Protocol files it as Google Organic, never as Google Ads.
 * No personal data, no full URLs, no query strings, no browsing history, no third-party storage.
 * The booking forms send it as one POST field, `attribution` (JSON), next to the unchanged
 * `source` field (where the form was filled in). Nothing here touches gtag, GA4, Clarity or the
 * Google Ads tags.
 */
(function () {
    var KEY = 'er_attr_v1';
    var TTL = 90 * 24 * 60 * 60 * 1000;
    var CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid'];
    var UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id'];
    var OWN_HOST = /(^|\.)elevaterepair\.com$/i;
    var memory = null;

    function read() {
        try {
            var s = JSON.parse(window.localStorage.getItem(KEY) || 'null');
            return s && s.v === 1 && s.first ? s : null;
        } catch (e) { return memory; }
    }
    function write(s) {
        memory = s;
        try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: memory only */ }
    }
    function clean(v, max) {
        v = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '').replace(/\s+/g, ' ').trim();
        return v ? v.slice(0, max) : '';
    }
    function currentTouch(at) {
        var t = { ts: new Date(at).toISOString(), path: String(window.location.pathname || '/').slice(0, 300) };
        var marketing = false, params = null, i, v, host = '';
        try { params = new URLSearchParams(window.location.search); } catch (e) { params = null; }
        if (params) {
            for (i = 0; i < CLICK_IDS.length; i++) {
                v = params.get(CLICK_IDS[i]);
                if (v && v.length >= 4 && v.length <= 512 && /^[A-Za-z0-9._~-]+$/.test(v)) { t[CLICK_IDS[i]] = v; marketing = true; }
            }
            for (i = 0; i < UTMS.length; i++) {
                v = clean(params.get(UTMS[i]), 150);
                if (v) { t[UTMS[i]] = v; marketing = true; }
            }
        }
        try { host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ''; } catch (e) { host = ''; }
        if (host && host !== String(window.location.hostname || '').toLowerCase() && !OWN_HOST.test(host)) {
            t.ref = host.slice(0, 253);
            marketing = true;
        }
        return { touch: t, nonDirect: marketing };
    }

    var at = Date.now();
    var state = read();
    if (state && (!state.firstAt || at - state.firstAt > TTL || at < state.firstAt - 86400000)) state = null;
    if (state && state.lastAt && at - state.lastAt > TTL) { delete state.last; delete state.lastAt; }
    var cur = currentTouch(at);
    if (!state) state = { v: 1, firstAt: at, first: cur.touch };
    if (cur.nonDirect) { state.last = cur.touch; state.lastAt = at; }
    write(state);

    /* The value the booking forms post as `attribution`: {"v":1,"first":{...},"last":{...}|null}. */
    window.erAttribution = function () {
        var s = read() || state;
        return JSON.stringify({ v: 1, first: s.first, last: s.last || null });
    };
})();
