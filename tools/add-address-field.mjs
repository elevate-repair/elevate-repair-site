#!/usr/bin/env node
/**
 * tools/add-address-field.mjs
 *
 * Inserts the service-address block (Full Service Address + Apt/Unit + Google
 * Places autocomplete) into every regular short booking form.
 *
 * Source of truth for the Maps bootstrap and autocomplete IIFE: book-online.html
 *
 * Safe to run multiple times — skips files that are already patched.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Config ────────────────────────────────────────────────────────────────────

const EXCLUDED = new Set(['book.html', 'book-online.html', 'contact.html']);

// Identifies the regular short-form endpoint (not book-online's separate endpoint)
const STANDARD_ENDPOINT =
    'AKfycbzCuzqtswIhfkEbAGiOeJr0K747SwHFF79NiB0esI7xtbp7tACAyxUFrJ5LuAo6T0gy7Q';

// Sentinel used for idempotency check — present after patching, absent before
const SENTINEL = 'name="place_id"';

// ── Extract blocks from book-online.html ─────────────────────────────────────

const bookOnlineSrc = readFileSync(resolve(ROOT, 'book-online.html'), 'utf8');

// Maps bootstrap: from the HTML comment through the closing </script>
// In book-online.html this block sits just before </head>
const mapsCommentMarker = '    <!-- Google Maps JS bootstrap loader (Places API New). Async; form works without it. -->';
const mapsStart = bookOnlineSrc.indexOf(mapsCommentMarker);
// The block ends just before \n</head>
const mapsEnd = bookOnlineSrc.indexOf('\n</head>', mapsStart);
if (mapsStart === -1 || mapsEnd === -1) {
    console.error('ERROR: Could not locate Maps bootstrap block in book-online.html');
    process.exit(1);
}
// The block to insert before </head> — includes the leading newline separator
const MAPS_BLOCK = '\n' + bookOnlineSrc.slice(mapsStart, mapsEnd);

// Autocomplete IIFE: from the inline comment through its closing })();
// In book-online.html the IIFE is followed by a blank line then "// Booking request:"
const acCommentMarker = '        // Inline address autocomplete (Place Autocomplete Data API). The visible';
const acStart = bookOnlineSrc.indexOf(acCommentMarker);
const acEndMarker = '\n\n        // Booking request:';
const acEnd = bookOnlineSrc.indexOf(acEndMarker, acStart);
if (acStart === -1 || acEnd === -1) {
    console.error('ERROR: Could not locate autocomplete IIFE in book-online.html');
    process.exit(1);
}
// Slice up to and including the \n after })(); (acEnd points to the first \n of the blank line)
const AUTOCOMPLETE_IIFE = bookOnlineSrc.slice(acStart, acEnd + 1); // ends with "        })();\n"

// ── Static HTML blocks ────────────────────────────────────────────────────────

// Hidden structured fields — inserted right after the hidden service field
const HIDDEN_FIELDS_BLOCK =
    '                <input type="hidden" id="place_id" name="place_id" value="">\n' +
    '                <input type="hidden" id="zip" name="zip" value="">\n' +
    '                <input type="hidden" id="city" name="city" value="">\n' +
    '                <input type="hidden" id="state" name="state" value="">\n';

// Address + unit form groups — inserted between Phone and Problem Description
const ADDRESS_FORM_GROUPS =
    '                <div class="form-group">\n' +
    '                    <label for="address">Full Service Address *</label>\n' +
    '                    <div class="address-field">\n' +
    '                        <input\n' +
    '                            type="text"\n' +
    '                            id="address"\n' +
    '                            name="address"\n' +
    '                            placeholder="1500 N Grant St, Denver, CO 80203"\n' +
    '                            autocomplete="street-address"\n' +
    '                            required\n' +
    '                        >\n' +
    '                        <div id="addressSuggestions" class="address-suggestions" hidden></div>\n' +
    '                    </div>\n' +
    "                    <p class=\"form-hint\">Start typing your address — we'll help you enter the correct service location.</p>\n" +
    '                </div>\n' +
    '                <div class="form-group">\n' +
    '                    <label for="unit">Apt / Unit / Suite (optional)</label>\n' +
    '                    <input\n' +
    '                        type="text"\n' +
    '                        id="unit"\n' +
    '                        name="unit"\n' +
    '                        placeholder="Apartment, unit, suite, floor, etc."\n' +
    '                        autocomplete="address-line2"\n' +
    '                    >\n' +
    '                </div>\n';

// ── Patch anchors ─────────────────────────────────────────────────────────────

// 1. Maps bootstrap: inserted just before </head>
const HEAD_ANCHOR = '</head>';

// 2. Hidden fields: inserted after the hidden service field line
//    Pattern present in all 217 target files
const HIDDEN_AFTER = '                <input type="hidden" name="service" id="serviceField" value="">\n';
const HIDDEN_REPLACEMENT = HIDDEN_AFTER + HIDDEN_FIELDS_BLOCK;

// 3. Address form groups: inserted between Phone group and Problem Description group
//    The phone input line is unique across all target files
const PHONE_TO_MSG_ANCHOR =
    '                </div>\n' +
    '                <div class="form-group">\n' +
    '                    <label for="message">Problem Description</label>';

const PHONE_TO_MSG_REPLACEMENT =
    '                </div>\n' +
    ADDRESS_FORM_GROUPS +
    '                <div class="form-group">\n' +
    '                    <label for="message">Problem Description</label>';

// 4. Autocomplete IIFE: inserted just before the burger-menu IIFE.
//    This anchor is unique in every target file and lives inside the JS <script>
//    block, regardless of whether JSON-LD <script> blocks follow it.
const BURGER_ANCHOR =
    '        (function() {\n' +
    "            var btn = document.querySelector('.burger-btn');";

const BURGER_REPLACEMENT =
    AUTOCOMPLETE_IIFE +
    '\n' +
    '        (function() {\n' +
    "            var btn = document.querySelector('.burger-btn');";

// ── Patch function ────────────────────────────────────────────────────────────

function patch(src) {
    src = src.replace(HEAD_ANCHOR, MAPS_BLOCK + '\n' + HEAD_ANCHOR);
    src = src.replace(HIDDEN_AFTER, HIDDEN_REPLACEMENT);
    src = src.replace(PHONE_TO_MSG_ANCHOR, PHONE_TO_MSG_REPLACEMENT);
    src = src.replace(BURGER_ANCHOR, BURGER_REPLACEMENT);
    return src;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(src, filename) {
    // Each of these must appear exactly once in a correctly patched file
    const checks = [
        'name="address"',
        'name="unit"',
        'name="place_id"',
        'name="zip"',
        'name="city"',
        'name="state"',
        'id="addressSuggestions"',
        'AIzaSyBDuRdbtcqv-18LuGiIG-LaJyYeyn1jfZU',
        '// Inline address autocomplete',
        'google.maps.importLibrary',   // appears twice in the IIFE; checked as >= 1 below
    ];

    const errors = [];
    for (const needle of checks) {
        let count = 0;
        let idx = 0;
        while ((idx = src.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }

        // google.maps.importLibrary appears twice (guard + call); all others must be exactly 1
        const expected = needle === 'google.maps.importLibrary' ? 2 : 1;
        if (count !== expected) {
            errors.push(`  "${needle}": expected ${expected}, found ${count}`);
        }
    }

    if (errors.length) {
        console.error(`VALIDATION FAILED: ${filename}`);
        errors.forEach(e => console.error(e));
        return false;
    }
    return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const htmlFiles = readdirSync(ROOT)
    .filter(f => f.endsWith('.html') && !EXCLUDED.has(f));

let updated = 0;
let skipped = 0;
let errors = 0;
const updatedFiles = [];

for (const filename of htmlFiles.sort()) {
    const filepath = resolve(ROOT, filename);
    const src = readFileSync(filepath, 'utf8');

    // Only target files with the standard form endpoint
    if (!src.includes(STANDARD_ENDPOINT)) {
        continue;
    }

    // Skip if already patched (idempotency)
    if (src.includes(SENTINEL)) {
        skipped++;
        continue;
    }

    // Apply patches
    const patched = patch(src);

    // Verify the result before writing
    if (!validate(patched, filename)) {
        errors++;
        continue;
    }

    writeFileSync(filepath, patched, 'utf8');
    updated++;
    updatedFiles.push(filename);
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log('\n=== add-address-field.mjs results ===');
console.log(`Updated : ${updated}`);
console.log(`Skipped (already patched): ${skipped}`);
if (errors > 0) {
    console.log(`Errors  : ${errors}`);
}
console.log('\nUpdated files:');
updatedFiles.forEach(f => console.log(`  ${f}`));
console.log(`\nTotal: ${updated} file(s) updated.`);

if (errors > 0) {
    process.exit(1);
}
