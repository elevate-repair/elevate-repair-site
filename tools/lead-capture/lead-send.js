/* Elevate Repair Denver - confirmed lead submission.
 * Rendered inline into every booking-form page by tools/apply-lead-capture.mjs; edit this file,
 * never a page.
 *
 * A request counts as received ONLY when the form's own Apps Script endpoint answers with JSON
 * {"ok": true, "submission_id": <the id this page sent>}. Neither a loaded iframe, an opaque
 * no-cors answer nor a finished request is proof. Only then are the thank-you flags set
 * (lead_submitted / ec_name / ec_phone, read by /thank-you, which fires generate_lead once) and the
 * visitor sent to /thank-you.html. An HTTP error, a dropped connection, a timeout, a non-JSON or
 * unconfirmed answer keeps the visitor on the page with every field as typed and a clear message;
 * the same button sends again.
 *
 * Idempotency: every attempt carries `submission_id`, one id per browser tab until a request is
 * confirmed, so a retry after a lost answer is recognised by the Apps Script (which then answers
 * {"ok": true, "duplicate": true} without a second lead). A second click while a request is in
 * flight does nothing.
 *
 * The POST keeps the form's own action (endpoint), method and every field as it is - `source`
 * (where the form was filled in) is unchanged - and adds `submission_id` and `attribution`
 * (tools/lead-capture/attribution.js). It is a CORS "simple" request (form-encoded body, no custom
 * headers), so the Apps Script JSON answer is readable without a preflight.
 */
(function () {
    var TIMEOUT_MS = 25000;
    var SID_KEY = 'er_lead_sid';
    var memorySid = '';
    var FAIL = 'We could not confirm that your request was received. Your details are still here — please try again. If it keeps failing, call us at (720) 575-8432.';
    var REJECTED = {
        invalid_phone: 'Please enter a valid US phone number and try again.',
        blocked_link: 'Links are not allowed in this form. Please remove the link and try again.'
    };

    function randomId() {
        try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) { /* fall through */ }
        var b = [], i;
        try { b = Array.prototype.slice.call(window.crypto.getRandomValues(new Uint8Array(16))); } catch (e) { for (i = 0; i < 16; i++) b.push(Math.floor(Math.random() * 256)); }
        return b.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    }
    /* One id per tab until a request is confirmed: a retry - on this page or another - reuses it. */
    function submissionId() {
        var v = '';
        try { v = window.sessionStorage.getItem(SID_KEY) || ''; } catch (e) { v = memorySid; }
        if (!/^[A-Za-z0-9-]{16,64}$/.test(v)) {
            v = randomId();
            try { window.sessionStorage.setItem(SID_KEY, v); } catch (e) { /* storage blocked */ }
        }
        memorySid = v;
        return v;
    }
    function forgetSubmissionId() {
        memorySid = '';
        try { window.sessionStorage.removeItem(SID_KEY); } catch (e) { /* storage blocked */ }
    }

    function body(form, id) {
        var p = new URLSearchParams();
        var fd = new FormData(form);
        fd.forEach(function (v, k) { if (typeof v === 'string') p.append(k, v); });
        p.set('submission_id', id);
        var a = '';
        try { a = typeof window.erAttribution === 'function' ? window.erAttribution() : ''; } catch (e) { a = ''; }
        if (a) p.set('attribution', a);
        return p;
    }

    /* Resolves {ok: true} only on the endpoint's explicit confirmation of THIS submission. */
    function post(form) {
        var id = submissionId();
        var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
        var done = function (r) { clearTimeout(timer); return r; };
        var req;
        try {
            req = fetch(form.getAttribute('action'), {
                method: 'POST', body: body(form, id), mode: 'cors', credentials: 'omit',
                cache: 'no-store', redirect: 'follow', signal: ctrl ? ctrl.signal : undefined
            });
        } catch (e) {
            return Promise.resolve(done({ ok: false, reason: 'network' }));
        }
        return req.then(function (res) {
            if (!res.ok) return { ok: false, reason: 'http_' + res.status };
            return res.text().then(function (t) {
                var d = null;
                try { d = JSON.parse(t); } catch (e) { return { ok: false, reason: 'unconfirmed' }; }
                if (d && d.ok === true && d.submission_id === id) return { ok: true };
                return { ok: false, reason: (d && typeof d.reason === 'string' && d.reason) || 'unconfirmed' };
            });
        }, function (e) {
            return { ok: false, reason: e && e.name === 'AbortError' ? 'timeout' : 'network' };
        }).then(done, function () { return done({ ok: false, reason: 'network' }); });
    }

    function message(form, anchor, text) {
        var box = form.querySelector('.lead-send-error');
        if (!text) { if (box) box.style.display = 'none'; return; }
        if (!box) {
            box = document.createElement('div');
            box.className = 'lead-send-error';
            box.setAttribute('role', 'alert');
            if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
            else form.appendChild(box);
        }
        box.textContent = text;
        box.style.display = 'block';
    }

    function confirmed(form) {
        var v = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value || '' : ''; };
        try {
            window.sessionStorage.setItem('ec_name', v('name'));
            window.sessionStorage.setItem('ec_phone', v('phone'));
            window.sessionStorage.setItem('lead_submitted', '1');
        } catch (e) { /* storage blocked: the thank-you page simply records nothing */ }
        forgetSubmissionId();
        window.location.href = '/thank-you.html';
    }

    /* Send `form`; on anything but a confirmation call onFail() after showing the message. */
    function submit(form, anchor, onFail) {
        message(form, anchor, '');
        return post(form).then(function (res) {
            if (res.ok) { confirmed(form); return res; }
            message(form, anchor, REJECTED[res.reason] || FAIL);
            if (onFail) onFail(res);
            return res;
        });
    }

    function phoneValid(form) {
        var input = form.querySelector('[name="phone"]');
        var d = String(input ? input.value : '').replace(/\D/g, '');
        if (d.length === 11 && d.charAt(0) === '1') d = d.substring(1);
        return d.length === 10 && !/^(\d)\1{9}$/.test(d) && /^[2-9]\d{2}[2-9]\d{6}$/.test(d);
    }
    function phoneError(form, show) {
        var input = form.querySelector('[name="phone"]');
        var err = document.getElementById('phone-error');
        if (!show) { if (err) err.style.display = 'none'; return; }
        if (!err) {
            err = document.createElement('div');
            err.id = 'phone-error';
            err.style.cssText = 'color:#dc2626;font-size:0.875rem;margin-top:0.25rem;';
            err.textContent = 'Please enter a valid US phone number.';
            if (input && input.parentNode) input.parentNode.insertBefore(err, input.nextSibling);
        }
        err.style.display = 'block';
        if (input) input.focus();
    }

    /* The standard booking form (homepage, city, problem, /book, /contact): one submit button. */
    function bindStandard(form) {
        var pending = false;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (pending) return;
            if (!phoneValid(form)) { phoneError(form, true); return; }
            phoneError(form, false);
            var btn = form.querySelector('button[type=submit]');
            var label = btn ? btn.innerHTML : '';
            pending = true;
            if (btn) { btn.disabled = true; btn.innerText = 'Sending...'; }
            submit(form, btn, function () {
                pending = false;
                if (btn) { btn.disabled = false; btn.innerHTML = label; }
            });
        });
    }

    /* /book-online: the page's own Review -> Confirm flow calls erLeadSend.submit(). Its form-start
       events match the standard form's: booking_form_view on the first interaction with the form,
       booking_step1_selected when the appliance is chosen, each once, with form_location. */
    function trackBookOnline(form) {
        var started = false, chosen = false;
        var service = form.querySelector('[name="service"]');
        var src = form.querySelector('[name="source"]');
        var params = function () {
            return {
                appliance: service ? service.value : '',
                form_location: src ? src.value : 'book_online',
                source_page: window.location.pathname || '/',
                form_type: 'book_online'
            };
        };
        form.addEventListener('focusin', function () {
            if (started || typeof window.gtag !== 'function') return;
            started = true;
            window.gtag('event', 'booking_form_view', params());
        });
        if (service) service.addEventListener('change', function () {
            if (chosen || !service.value || typeof window.gtag !== 'function') return;
            chosen = true;
            window.gtag('event', 'booking_step1_selected', params());
        });
    }

    window.erLeadSend = { submit: submit };

    var form = document.getElementById('bookingForm');
    if (!form || (form.getAttribute('action') || '').indexOf('script.google.com') === -1) return;
    if (document.getElementById('confirmBookingBtn')) trackBookOnline(form);
    else bindStandard(form);
})();
