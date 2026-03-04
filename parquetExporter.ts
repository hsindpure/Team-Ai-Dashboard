// @ts-nocheck
/**
 * parquetExporter.ts -- Databricks → Parquet File Exporter
 * ----------------------------------------------------------
 * Run once a day (manually or via scheduler):
 *   npm run sync
 *
 * What it does:
 *   1. Fetches raw claim rows from Databricks
 *   2. Aggregates into client analytics via claimsCalculator
 *   3. Saves aggregated clients as JSON wrapped in parquet
 *      to: backend/dataFile/claimsiq_cache.parquet
 *
 * The Express server reads this parquet file on every boot
 * instead of hitting Databricks — boot time goes from
 * 5-10 minutes → under 3 seconds.
 */

require('dotenv').config();

const path   = require('path');
const fs     = require('fs');
const parquet = require('parquetjs-lite');
const { loadDatabricksData, isDatabricksConfigured } = require('./databricksConnector');

// ── CONFIG ────────────────────────────────────────────────────
const OUTPUT_DIR  = path.resolve(__dirname, '../dataFile');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'claimsiq_cache.parquet');
const META_FILE   = path.join(OUTPUT_DIR, 'claimsiq_cache_meta.json');

// ── PARQUET SCHEMA ────────────────────────────────────────────
// We store each client as one row with:
//   - All scalar KPI fields as typed columns
//   - Full analytics blob as a JSON string column
const SCHEMA = new parquet.ParquetSchema({
  id:          { type: 'UTF8' },
  name:        { type: 'UTF8' },
  members:     { type: 'INT64' },
  pmpy:        { type: 'DOUBLE' },
  pmpm:        { type: 'DOUBLE' },
  trendPct:    { type: 'DOUBLE' },
  chronicPct:  { type: 'DOUBLE' },
  riskScore:   { type: 'DOUBLE' },
  totalCost:   { type: 'DOUBLE' },
  totalBilled: { type: 'DOUBLE' },
  totalClaims: { type: 'INT64'  },
  avgAge:      { type: 'DOUBLE' },
  industry:    { type: 'UTF8'   },
  country:     { type: 'UTF8'   },
  currency:    { type: 'UTF8'   },
  analyticsJson: { type: 'UTF8' }, // full analytics object as JSON string
});

// ── HELPERS ───────────────────────────────────────────────────
const C = {
  green:  '\x1b[32m', yellow: '\x1b[33m',
  red:    '\x1b[31m', cyan:   '\x1b[36m',
  bold:   '\x1b[1m',  reset:  '\x1b[0m',
};
const log  = (m) => console.log(`${C.cyan}[exporter]${C.reset} ${m}`);
const ok   = (m) => console.log(`${C.green}[exporter] ✓${C.reset} ${m}`);
const fail = (m) => console.log(`${C.red}[exporter] ✗${C.reset} ${m}`);

// ── MAIN ──────────────────────────────────────────────────────
async function runExport() {
  const t0 = Date.now();

  console.log('\n' + '═'.repeat(54));
  console.log(`${C.bold}  ClaimsIQ — Databricks → Parquet Exporter${C.reset}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═'.repeat(54) + '\n');

  // ── 1. PRE-FLIGHT ─────────────────────────────────────────
  if (!isDatabricksConfigured()) {
    fail('Databricks not configured. Check .env');
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    log(`Created output directory: ${OUTPUT_DIR}`);
  }

  // ── 2. FETCH FROM DATABRICKS ──────────────────────────────
  log('Fetching from Databricks (this takes 5-10 mins)...');
  let result;
  try {
    result = await loadDatabricksData();
  } catch (e) {
    fail(`Databricks fetch failed: ${e.message}`);
    process.exit(1);
  }

  const { clients, meta } = result;
  ok(`Fetched ${clients.length} clients | ${(meta.totalClaims || 0).toLocaleString()} claims`);
  ok(`Policy years: ${(meta.policyYears || []).join(', ')}`);

  // ── 3. WRITE PARQUET FILE ─────────────────────────────────
  log(`Writing parquet file: ${OUTPUT_FILE}`);

  // Remove old file if exists
  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
    log('Removed old parquet file');
  }

  try {
    const writer = await parquet.ParquetWriter.openFile(SCHEMA, OUTPUT_FILE);

    for (const c of clients) {
      await writer.appendRow({
        id:            String(c.id          || ''),
        name:          String(c.name        || ''),
        members:       Math.round(Number(c.members     || 0)),
        pmpy:          Number(c.pmpy        || 0),
        pmpm:          Number(c.pmpm        || 0),
        trendPct:      Number(c.trendPct    || 0),
        chronicPct:    Number(c.chronicPct  || 0),
        riskScore:     Number(c.riskScore   || 0),
        totalCost:     Number(c.totalCost   || 0),
        totalBilled:   Number(c.totalBilled || 0),
        totalClaims:   Math.round(Number(c.totalClaims || 0)),
        avgAge:        Number(c.avgAge      || 0),
        industry:      String(c.industry    || 'HMO / Corporate Health'),
        country:       String(c.country     || 'Philippines'),
        currency:      String(c.currency    || '₱'),
        analyticsJson: JSON.stringify(c.analytics || {}),
      });
    }

    await writer.close();
    ok(`Parquet file written: ${OUTPUT_FILE}`);

  } catch (e) {
    fail(`Parquet write failed: ${e.message}`);
    process.exit(1);
  }

  // ── 4. WRITE META FILE ────────────────────────────────────
  // Separate small JSON for quick meta reads without parsing parquet
  const metaOut = {
    exportedAt:    new Date().toISOString(),
    source:        'databricks',
    totalClients:  clients.length,
    totalClaims:   meta.totalClaims   || 0,
    policyYears:   meta.policyYears   || [],
    loadTimeSeconds: meta.loadTimeSeconds || 0,
    exportTimeMs:  Date.now() - t0,
    filePath:      OUTPUT_FILE,
    fileSize:      fs.statSync(OUTPUT_FILE).size,
  };
  fs.writeFileSync(META_FILE, JSON.stringify(metaOut, null, 2));
  ok(`Meta file written: ${META_FILE}`);

  // ── 5. SUMMARY ────────────────────────────────────────────
  const elapsed   = ((Date.now() - t0) / 1000).toFixed(1);
  const fileSizeKb = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);

  console.log('\n' + '─'.repeat(54));
  console.log(`${C.green}${C.bold}  ✓ Export Complete${C.reset}`);
  console.log(`  Clients exported : ${clients.length}`);
  console.log(`  Claims processed : ${(meta.totalClaims || 0).toLocaleString()}`);
  console.log(`  Policy years     : ${(meta.policyYears || []).join(', ')}`);
  console.log(`  File size        : ${fileSizeKb} KB`);
  console.log(`  Total time       : ${elapsed}s`);
  console.log(`  Output           : ${OUTPUT_FILE}`);
  console.log('─'.repeat(54) + '\n');

  process.exit(0);
}

runExport().catch((e) => {
  fail(`Unexpected error: ${e.message}`);
  console.error(e);
  process.exit(1);
});
