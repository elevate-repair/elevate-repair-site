#!/usr/bin/env node
/**
 * Lead capture - confirmed form submission + first-party attribution. Render + drift check.
 *
 *   node tools/apply-lead-capture.mjs           render
 *   node tools/apply-lead-capture.mjs --check   report drift, exit 1 on any
 *
 * Two inline blocks, rendered from their sources (never hand-edit a page):
 *
 *   <script data-er="attribution">  tools/lead-capture/attribution.js - before </head> on every
 *       production page except thank-you.html (the conversion page stays byte-identical). Keeps the
 *       raw first / last non-direct touch (click ids, UTMs, referrer host, landing path) and exposes
 *       window.erAttribution() for the booking forms.
 *   <script data-er="lead-send">    tools/lead-capture/lead-send.js - before </body> on every page
 *       with a booking form that posts to Apps Script (the 219 standard forms, /book, /contact and
 *       /book-online). Sends the form with fetch, counts it as received only on the endpoint's JSON
 *       confirmation of this submission_id, keeps the fields and shows a message otherwise.
 *
 * And the one-time migration of the page code that the blocks replace (exact strings only, so
 * anything unexpected fails the check instead of being rewritten):
 *   - the legacy submit IIFE that treated the hidden iframe's `load` as success is removed;
 *   - the form-start events (booking_step1_selected / booking_form_view) carry `form_location`
 *     instead of `source` - GA4 reads an event parameter named `source` as a traffic source;
 *   - /book-online's Confirm button sends through window.erLeadSend instead of form.submit().
 * The form markup itself - action (endpoint), method, every field including `source` - is not
 * touched; tools/qa-denver-invariants.mjs proves it. The thank-you page (flag -> conversion +
 * generate_lead, once) is not touched either.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, productionPages, read } from './denver-pages.mjs';

const CHECK = process.argv.includes('--check');
const src = (f) => readFileSync(join(ROOT, 'tools', 'lead-capture', f), 'utf8');
const indent = (code, pad) => code.replace(/\s+$/, '').split('\n').map((l) => (l ? pad + l : l)).join('\n');

export const ATTRIBUTION_BLOCK = `    <script data-er="attribution">\n${indent(src('attribution.js'), '    ')}\n    </script>\n`;
export const LEAD_SEND_BLOCK = `    <script data-er="lead-send">\n${indent(src('lead-send.js'), '    ')}\n    </script>\n`;
const MANAGED_RE = /^[ \t]*<script data-er="(?:attribution|lead-send)">[\s\S]*?<\/script>\n/gm;

// ── the page code the blocks replace (exact strings) ─────────────────────────
const LEGACY_SUBMIT_RE = /\n([ \t]*)\(function\(\) \{\n[ \t]*var submitted = false;\n[\s\S]*?\n\1\}\)\(\);\n/g;
const isLegacySubmit = (block) => /hidden_iframe/.test(block) && /addEventListener\("load"|addEventListener\('load'/.test(block) && /thank-you/.test(block);
const REVEAL_OLD = "source: srcField ? srcField.value : 'website-denver',";
const REVEAL_NEW = "form_location: srcField ? srcField.value : 'website-denver',";

const BO_CONFIRM_OLD = `                confirmBtn.innerText = 'Sending...';
                form.submit();
            });`;
const BO_CONFIRM_NEW = `                confirmBtn.innerText = 'Sending...';
                // Counted as sent only on the Apps Script's JSON confirmation (tools/lead-capture/lead-send.js);
                // otherwise the request stays as typed and can be confirmed again.
                var unconfirmed = function() {
                    submitted = false;
                    confirmBtn.disabled = false;
                    confirmBtn.innerText = 'Confirm Booking Request';
                    closeModal();
                };
                if (!window.erLeadSend) { unconfirmed(); return; }
                window.erLeadSend.submit(form, reviewBtn, unconfirmed);
            });`;
const BO_COMMENT_OLD = `            // Block every native submission (Enter key, implicit submit,
            // autofill). The only valid path is Review -> Confirm, which uses
            // form.submit() and therefore never fires this event. Enter is
            // routed into the same validation flow as the Review button.`;
const BO_COMMENT_NEW = `            // Block every native submission (Enter key, implicit submit,
            // autofill). The only valid path is Review -> Confirm, which sends
            // through window.erLeadSend and never fires this event. Enter is
            // routed into the same validation flow as the Review button.`;
const BO_IFRAME_OLD = `
            iframe.addEventListener('load', function() {
                if (!submitted) return;
                submitted = false;
                sessionStorage.setItem('ec_name', form.querySelector('[name="name"]').value || '');
                sessionStorage.setItem('ec_phone', form.querySelector('[name="phone"]').value || '');
                sessionStorage.setItem('lead_submitted', '1');
                window.location.href = '/thank-you.html';
            });`;

/** The one-time migration of a page's own code (idempotent; exact strings). */
export function migrateLegacy(page) {
  let out = page.replace(LEGACY_SUBMIT_RE, (m) => (isLegacySubmit(m) ? '\n' : m));
  out = out.split(REVEAL_OLD).join(REVEAL_NEW);
  out = out.split(BO_CONFIRM_OLD).join(BO_CONFIRM_NEW).split(BO_COMMENT_OLD).join(BO_COMMENT_NEW).split(BO_IFRAME_OLD).join('');
  return out;
}

/** Remove the managed blocks (for comparisons: they are checked here, not by the invariants guard). */
export const stripManaged = (page) => page.replace(MANAGED_RE, '');

export const hasAppsScriptForm = (page) => /<form\b[^>]*id="bookingForm"[^>]*action="https:\/\/script\.google\.com\/macros\/s\//.test(page);

export function render(page) {
  let out = migrateLegacy(stripManaged(page));
  out = out.replace(/^([ \t]*)<\/head>/m, (m) => ATTRIBUTION_BLOCK + m);
  if (hasAppsScriptForm(out)) out = out.replace(/^([ \t]*)<\/body>/m, (m) => LEAD_SEND_BLOCK + m);
  return out;
}

const isMain = process.argv[1] && process.argv[1].endsWith('apply-lead-capture.mjs');
if (isMain) {
  const problems = [];
  let changed = 0, attr = 0, send = 0;
  const targets = productionPages().filter((p) => p !== 'thank-you.html')
    .concat(['tools/template_city_base.html', 'tools/problem-page-template.html']);
  for (const rel of targets) {
    const before = read(rel);
    const out = render(before);
    const code = out.replace(MANAGED_RE, '');
    if (out.includes('data-er="attribution"')) attr++;
    else if (!rel.startsWith('tools/')) problems.push(`${rel}: attribution block missing`);
    if (hasAppsScriptForm(out)) {
      send++;
      if (!out.includes('data-er="lead-send"')) problems.push(`${rel}: booking form without the lead-send block`);
      // nothing may treat a loaded iframe as a received lead, nor set the thank-you flag itself
      if (/addEventListener\(\s*["']load["']/.test(code) && /thank-you/.test(code)) problems.push(`${rel}: an iframe-load redirect is still in the page code`);
      if (/setItem\('lead_submitted'/.test(code)) problems.push(`${rel}: the page sets lead_submitted outside the lead-send block`);
      if (/form\.submit\(\)/.test(code)) problems.push(`${rel}: a native form.submit() is still in the page code`);
      if (/id="confirmBookingBtn"/.test(code) && !code.includes('window.erLeadSend.submit(form, reviewBtn, unconfirmed)')) problems.push(`${rel}: /book-online does not send through erLeadSend`);
    } else if (out.includes('data-er="lead-send"')) problems.push(`${rel}: lead-send block on a page without a booking form`);
    // a form event must never carry a parameter named `source` (GA4 reads it as a traffic source)
    if (/\bsource:\s*srcField/.test(code)) problems.push(`${rel}: a form event still sends a \`source\` parameter`);
    if (out !== before) {
      changed++;
      if (CHECK) problems.push(`${rel}: drift (run node tools/apply-lead-capture.mjs)`);
      else writeFileSync(join(ROOT, rel), out);
    }
  }
  if (read('thank-you.html').includes('data-er=')) problems.push('thank-you.html: must stay untouched');
  const css = read('styles.css');
  if (!/\.lead-send-error\b/.test(css)) problems.push('styles.css: .lead-send-error style missing');
  if (CHECK) {
    if (problems.length) { console.log('FAIL - lead capture:'); problems.slice(0, 80).forEach((p) => console.log('  ' + p)); process.exit(1); }
    console.log(`PASS - attribution block on ${attr} page(s); confirmed lead sending on ${send} booking form(s); no iframe-load success, no native submit, no \`source\` event parameter.`);
  } else {
    problems.forEach((p) => console.log('  ' + p));
    console.log(`apply-lead-capture: ${changed} file(s) updated (${attr} with attribution, ${send} with lead-send).`);
  }
}
