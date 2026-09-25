#!/usr/bin/env node
/**
 * check-google-tag.mjs
 *
 * Blocking QA check for the Denver Google tag architecture.
 *
 * The Denver GA4 destination (G-YJVEJZRS5W) now sits behind the Google tag
 * GT-PBSXVWKK. Pages must load GT-PBSXVWKK as their single base gtag.js
 * loader and configure both GT-PBSXVWKK and the Ads account AW-17878510208.
 * G-YJVEJZRS5W must never be used as a loader or a direct config again --
 * it is resolved server-side by Google, behind the GT- tag.
 *
 * Usage:  node tools/check-google-tag.mjs
 * Exit:   0 = pass, 1 = violations found
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const GOOGLE_TAG = 'GT-PBSXVWKK';   // required base loader + config
const ADS_ID     = 'AW-17878510208'; // required Ads config (never the loader)
const GA4_ID     = 'G-YJVEJZRS5W';   // destination only - never loader/config

const SKIP_DIRS = new Set(['.git', 'node_modules', 'assets']);

const LOADER_RE = /googletagmanager\.com\/gtag\/js\?id=([A-Za-z0-9_-]+)/g;
const CONFIG_RE = /gtag\(\s*['"]config['"]\s*,\s*['"]([^'"]+)['"]/g;

function htmlFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) htmlFiles(full, out);
    } else if (entry.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function matchAll(re, text) {
  re.lastIndex = 0;
  return [...text.matchAll(re)].map((m) => m[1]);
}

const errors = [];
const untagged = [];
let checked = 0;

for (const file of htmlFiles(ROOT).sort()) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const html = readFileSync(file, 'utf-8');

  const loaders = matchAll(LOADER_RE, html);
  const configs = matchAll(CONFIG_RE, html);

  // A page with no Google tag at all is not a tag-architecture regression;
  // report it but do not block on it.
  if (loaders.length === 0 && configs.length === 0) {
    untagged.push(rel);
    continue;
  }
  checked++;

  const fail = (msg) => errors.push(`${rel}: ${msg}`);

  // 1. Exactly one base gtag.js loader per page.
  if (loaders.length !== 1) {
    fail(`expected exactly 1 base gtag.js loader, found ${loaders.length} (${loaders.join(', ') || 'none'})`);
  }

  // 2. The loader must be the Google tag - never GA4 directly, never Ads.
  for (const id of loaders) {
    if (id === GA4_ID) {
      fail(`uses GA4 id ${GA4_ID} as the gtag.js loader; the loader must be ${GOOGLE_TAG}`);
    } else if (id === ADS_ID) {
      fail(`uses Ads id ${ADS_ID} as the primary gtag.js loader; the loader must be ${GOOGLE_TAG}`);
    } else if (id !== GOOGLE_TAG) {
      fail(`unexpected gtag.js loader id "${id}"; the loader must be ${GOOGLE_TAG}`);
    }
  }

  // 3. GA4 must never be configured directly - it resolves behind the Google tag.
  if (configs.includes(GA4_ID)) {
    fail(`configures GA4 id ${GA4_ID} directly; it is a destination behind ${GOOGLE_TAG} and must not be configured`);
  }

  // 4. The Google tag must be configured.
  if (!configs.includes(GOOGLE_TAG)) {
    fail(`missing gtag('config', '${GOOGLE_TAG}')`);
  }

  // 5. The Ads config must survive. This is a REQUIRED config, never a violation.
  if (!configs.includes(ADS_ID)) {
    fail(`missing gtag('config', '${ADS_ID}') - the Google Ads config must not be removed`);
  }
}

console.log(`Google tag QA - checked ${checked} tagged HTML page(s).`);
console.log(`  required loader : ${GOOGLE_TAG}`);
console.log(`  required configs: ${GOOGLE_TAG}, ${ADS_ID}`);
console.log(`  forbidden       : ${GA4_ID} as loader or config\n`);

if (untagged.length) {
  console.log(`Note: ${untagged.length} HTML file(s) carry no Google tag (not blocking):`);
  for (const f of untagged) console.log(`  - ${f}`);
  console.log('');
}

if (errors.length) {
  console.error(`FAIL - ${errors.length} Google tag violation(s):\n`);
  for (const e of errors) console.error(`  x ${e}`);
  console.error('\nDenver pages must load ONE base gtag.js loader (' + GOOGLE_TAG + ') and');
  console.error('configure ' + GOOGLE_TAG + ' + ' + ADS_ID + '. ' + GA4_ID + ' stays behind the');
  console.error('Google tag on Google\'s side and must not appear as a loader or config.');
  process.exit(1);
}

console.log('PASS - Google tag architecture is correct on every tagged page.');
