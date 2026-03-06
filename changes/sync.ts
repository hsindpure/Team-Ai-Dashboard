// @ts-nocheck
/**
 * sync.ts -- Databricks → MongoDB Raw Claims Sync
 * ─────────────────────────────────────────────────
 * Run with:  npm run sync
 *
 * What it does:
 *   1. Connects to MongoDB
 *   2. Fetches raw claim rows from Databricks (no calculation)
 *   3. Stores raw rows into ciq_raw_claims collection (bulk upsert)
 *   4. Logs a sync record to ciq_sync_history
 *   5. Exits cleanly
 *
 * The API server (npm run dev) then reads from ciq_raw_claims,
 * runs aggregateClaimsToClients() on that data, and serves results.
 */

require('dotenv').config();

const mongoose = require('mongoose');

// ── RAW CLAIMS SCHEMA ────────────────────────────────────────────
// Stores each raw claim row as a document.
// We partition by a "syncId" (timestamp) so we can replace the full
// dataset atomically on each sync run.
const RawClaimSchema = new mongoose.Schema({
  syncId:    { type: String, required: true, index: true }, // e.g. "2025-01"
  rowIndex:  Number,
  data:      mongoose.Schema.Types.Mixed, // the raw claim row object
}, { collection: 'ciq_raw_claims', timestamps: false });

RawClaimSchema.index({ syncId: 1, rowIndex: 1 });

const SyncHistorySchema = new mongoose.Schema({
  syncId:      String,
  source:      { type: String, default: 'databricks' },
  totalRows:   Number,
  durationMs:  Number,
  status:      { type: String, default: 'success' },
  error:       String,
  table:       String,
  host:        String,
}, { collection: 'ciq_sync_history', timestamps: true });

let RawClaimModel    = null;
let SyncHistoryModel = null;

function getModels() {
  if (!RawClaimModel) {
    RawClaimModel    = mongoose.model('CiqRawClaim',    RawClaimSchema);
    SyncHistoryModel = mongoose.model('CiqSyncHistory', SyncHistorySchema);
  }
  return { RawClaimModel, SyncHistoryModel };
}

// ── CONNECT MONGO ────────────────────────────────────────────────
async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  const db  = process.env.MONGODB_DB || 'healthiqDev';
  if (!uri) throw new Error('MONGODB_URI not set in .env');
  await mongoose.connect(uri, { dbName: db, serverSelectionTimeoutMS: 10000 });
  const host = uri.includes('@') ? uri.split('@')[1].split('/')[0] : 'localhost';
  console.log(`[sync] ✓ MongoDB connected  db=${db}  host=${host}`);
  getModels();
}

// ── FETCH RAW ROWS FROM DATABRICKS ──────────────────────────────
// We import only fetchClaimsFromDatabricks — NOT loadDatabricksData.
// This gives us the raw rows without running claimsCalculator.
async function fetchRawRows() {
  const { fetchClaimsFromDatabricks, DB_CONFIG } = require('./databricksConnector');
  console.log(`[sync] Fetching raw claims from Databricks: ${DB_CONFIG.host}`);
  const rows = await fetchClaimsFromDatabricks();
  if (!rows || rows.length === 0) throw new Error('Databricks returned 0 rows.');
  console.log(`[sync] ✓ Fetched ${rows.length.toLocaleString()} raw claim rows`);
  return { rows, table: DB_CONFIG.table || 'auto', host: DB_CONFIG.host };
}

// ── STORE RAW ROWS IN MONGO ──────────────────────────────────────
async function storeRawRows(rows, syncId) {
  const { RawClaimModel } = getModels();

  // Delete previous data for this syncId (full replace strategy)
  const deleted = await RawClaimModel.deleteMany({ syncId });
  if (deleted.deletedCount > 0) {
    console.log(`[sync] Cleared ${deleted.deletedCount} old rows for syncId=${syncId}`);
  }

  // Batch insert in chunks of 5,000 to avoid memory pressure
  const CHUNK = 5000;
  let inserted = 0;
  console.log(`[sync] Inserting ${rows.length.toLocaleString()} rows in chunks of ${CHUNK}...`);

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((row, j) => ({
      syncId,
      rowIndex: i + j,
      data: row,
    }));
    await RawClaimModel.insertMany(chunk, { ordered: false });
    inserted += chunk.length;
    process.stdout.write(`\r[sync] Inserted ${inserted.toLocaleString()} / ${rows.length.toLocaleString()}...`);
  }
  console.log(`\n[sync] ✓ All rows stored`);
}

// ── WRITE LATEST POINTER ─────────────────────────────────────────
// Stores which syncId is the "current" one so the API can find it.
const LatestSyncSchema = new mongoose.Schema({
  _id:    { type: String, default: 'latest' },
  syncId: String,
  syncedAt: Date,
  totalRows: Number,
}, { collection: 'ciq_sync_pointer' });

let LatestSyncModel = null;

async function writeLatestPointer(syncId, totalRows) {
  if (!LatestSyncModel) LatestSyncModel = mongoose.model('CiqLatestSync', LatestSyncSchema);
  await LatestSyncModel.findOneAndUpdate(
    { _id: 'latest' },
    { syncId, syncedAt: new Date(), totalRows },
    { upsert: true, new: true }
  );
  console.log(`[sync] ✓ Latest pointer set → syncId=${syncId}`);
}

// ── MAIN ─────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();

  console.log('\n════════════════════════════════════════');
  console.log('  ClaimsIQ Sync  -- Databricks → MongoDB');
  console.log('════════════════════════════════════════\n');

  try {
    await connectMongo();
  } catch (e) {
    console.error('[sync] ✗ MongoDB connection failed:', e.message);
    process.exit(1);
  }

  let rows, table, host;
  try {
    ({ rows, table, host } = await fetchRawRows());
  } catch (e) {
    console.error('[sync] ✗ Databricks fetch failed:', e.message);
    await logSyncHistory({ syncId: 'failed', totalRows: 0, durationMs: Date.now() - t0, status: 'error', error: e.message });
    await mongoose.disconnect();
    process.exit(1);
  }

  // syncId = YYYY-MM timestamp so each monthly run is traceable
  const syncId = new Date().toISOString().slice(0, 7); // e.g. "2025-01"

  try {
    await storeRawRows(rows, syncId);
    await writeLatestPointer(syncId, rows.length);
  } catch (e) {
    console.error('[sync] ✗ Storage failed:', e.message);
    await logSyncHistory({ syncId, totalRows: rows.length, durationMs: Date.now() - t0, status: 'error', error: e.message, table, host });
    await mongoose.disconnect();
    process.exit(1);
  }

  const durationMs = Date.now() - t0;
  await logSyncHistory({ syncId, totalRows: rows.length, durationMs, status: 'success', table, host });

  console.log(`\n✅ Sync complete`);
  console.log(`   syncId    : ${syncId}`);
  console.log(`   rows      : ${rows.length.toLocaleString()}`);
  console.log(`   duration  : ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`   MongoDB   : ciq_raw_claims\n`);

  await mongoose.disconnect();
  process.exit(0);
}

async function logSyncHistory({ syncId, totalRows, durationMs, status, error, table, host }) {
  try {
    const { SyncHistoryModel } = getModels();
    await SyncHistoryModel.create({ syncId, totalRows, durationMs, status, error: error || null, table, host });
  } catch (e) {
    console.warn('[sync] Could not write sync history:', e.message);
  }
}

main();
