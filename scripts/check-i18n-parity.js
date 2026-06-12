/**
 * check-i18n-parity.js
 *
 * Diffs the key paths of hi.json and gu.json against en.json (the source of truth).
 * Only checks the `onboarding` namespace — the scope of chunk #14.
 *
 * Usage:
 *   node scripts/check-i18n-parity.js
 *
 * Exit 0 = all keys present in all locales.
 * Exit 1 = one or more keys are missing.
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'client', 'src', 'i18n', 'locales');
const NAMESPACE   = 'onboarding';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Recursively extract all dot-notation key paths from an object. */
function flatKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flatKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

/** Return keys in `source` that are absent in `target`. */
function missingKeys(sourceKeys, targetKeys) {
  const targetSet = new Set(targetKeys);
  return sourceKeys.filter(k => !targetSet.has(k));
}

/** Return keys in `target` that are still placeholder strings ([hi] / [gu]). */
function placeholderKeys(obj, prefix = '') {
  const hits = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      hits.push(...placeholderKeys(v, full));
    } else if (typeof v === 'string' && /^\[(hi|gu)\]/.test(v)) {
      hits.push(`${full} → "${v}"`);
    }
  }
  return hits;
}

// ── load ─────────────────────────────────────────────────────────────────────

function loadNamespace(locale) {
  const file = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ns = json[NAMESPACE];
  if (!ns) throw new Error(`Namespace "${NAMESPACE}" not found in ${locale}.json`);
  return ns;
}

// ── main ─────────────────────────────────────────────────────────────────────

let exitCode = 0;

try {
  const en = loadNamespace('en');
  const hi = loadNamespace('hi');
  const gu = loadNamespace('gu');

  const enKeys = flatKeys(en);
  const hiKeys = flatKeys(hi);
  const guKeys = flatKeys(gu);

  console.log(`\nChecking namespace: ${NAMESPACE}`);
  console.log(`  en keys : ${enKeys.length}`);
  console.log(`  hi keys : ${hiKeys.length}`);
  console.log(`  gu keys : ${guKeys.length}`);

  // ── Missing key checks ────────────────────────────────────────────────────

  const hiMissing = missingKeys(enKeys, hiKeys);
  const guMissing = missingKeys(enKeys, guKeys);
  const extraHi   = missingKeys(hiKeys, enKeys);
  const extraGu   = missingKeys(guKeys, enKeys);

  if (hiMissing.length) {
    console.error(`\n[FAIL] hi.json is missing ${hiMissing.length} key(s):`);
    hiMissing.forEach(k => console.error(`  - ${k}`));
    exitCode = 1;
  } else {
    console.log('\n[PASS] hi.json — no missing keys');
  }

  if (guMissing.length) {
    console.error(`\n[FAIL] gu.json is missing ${guMissing.length} key(s):`);
    guMissing.forEach(k => console.error(`  - ${k}`));
    exitCode = 1;
  } else {
    console.log('[PASS] gu.json — no missing keys');
  }

  if (extraHi.length) {
    console.warn(`\n[WARN] hi.json has ${extraHi.length} extra key(s) not in en.json:`);
    extraHi.forEach(k => console.warn(`  + ${k}`));
  }
  if (extraGu.length) {
    console.warn(`\n[WARN] gu.json has ${extraGu.length} extra key(s) not in en.json:`);
    extraGu.forEach(k => console.warn(`  + ${k}`));
  }

  // ── Placeholder remnant checks ────────────────────────────────────────────

  const hiPlaceholders = placeholderKeys(hi);
  const guPlaceholders = placeholderKeys(gu);

  if (hiPlaceholders.length) {
    console.error(`\n[FAIL] hi.json still has ${hiPlaceholders.length} untranslated placeholder(s):`);
    hiPlaceholders.forEach(p => console.error(`  ${p}`));
    exitCode = 1;
  } else {
    console.log('[PASS] hi.json — no [hi] placeholders remaining');
  }

  if (guPlaceholders.length) {
    console.error(`\n[FAIL] gu.json still has ${guPlaceholders.length} untranslated placeholder(s):`);
    guPlaceholders.forEach(p => console.error(`  ${p}`));
    exitCode = 1;
  } else {
    console.log('[PASS] gu.json — no [gu] placeholders remaining');
  }

  console.log(exitCode === 0 ? '\nAll checks passed.' : '\nOne or more checks failed.');

} catch (err) {
  console.error('\n[ERROR]', err.message);
  exitCode = 1;
}

process.exit(exitCode);
