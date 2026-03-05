// @ts-nocheck
/**
 * syncCache.ts -- Databricks → JSON Cache
 * Run once:   npm run sync
 * Output:     backend/dataFile/claimsiq_cache.json  (in .gitignore)
 */

require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const { loadDatabricksData, isDatabricksConfigured } = require('./databricksConnector');

const OUTPUT_DIR = path.resolve(__dirname, '../dataFile');
const CACHE_FILE = path.join(OUTPUT_DIR, 'claimsiq_cache.json');

const log  = (m) => console.log(`\x1b[36m[sync]\x1b[0m ${m}`);
const ok   = (m) => console.log(`\x1b[32m[sync] ✓\x1b[0m ${m}`);
const fail = (m) => console.log(`\x1b[31m[sync] ✗\x1b[0m ${m}`);

async function runSync() {
  const t0 = Date.now();
  console.log('\n' + '═'.repeat(52));
  console.log('  ClaimsIQ — Databricks → JSON Cache Sync');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═'.repeat(52) + '\n');

  if (!isDatabricksConfigured()) {
    fail('Databricks not configured. Check .env'); process.exit(1);
  }
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  log('Connecting to Databricks (5-10 mins for large data)...');
  let result;
  try {
    result = await loadDatabricksData();
  } catch (e) {
    fail(`Databricks fetch failed: ${e.message}`); process.exit(1);
  }

  const { clients, meta } = result;
  ok(`Fetched ${clients.length} clients | ${(meta.totalClaims||0).toLocaleString()} claims`);

  const payload = {
    syncedAt:        new Date().toISOString(),
    source:          'databricks',
    totalClients:    clients.length,
    totalClaims:     meta.totalClaims     || 0,
    policyYears:     meta.policyYears     || [],
    loadTimeSeconds: meta.loadTimeSeconds || 0,
    syncTimeMs:      Date.now() - t0,
    clients,
  };

  fs.writeFileSync(CACHE_FILE, JSON.stringify(payload), 'utf8');
  const kb      = (fs.statSync(CACHE_FILE).size / 1024).toFixed(1);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n  ✓ Sync Complete');
  console.log(`  Clients : ${clients.length}`);
  console.log(`  Size    : ${kb} KB`);
  console.log(`  Time    : ${elapsed}s`);
  console.log(`  File    : ${CACHE_FILE}\n`);
  process.exit(0);
}

runSync().catch((e) => { fail(e.message); process.exit(1); });