// @ts-nocheck
/**
 * mongoConnector.ts -- MongoDB Atlas Integration  v3.1
 * ─────────────────────────────────────────────────────
 * Two responsibilities:
 *
 *  A) SYNC path (npm run sync):
 *     Raw claim rows written by sync.ts into ciq_raw_claims.
 *     loadRawClaimsFromMongo() reads them back for the API.
 *
 *  B) CLIENT path (npm run dev):
 *     persistClients()        -- save aggregated client docs (optional, for audit)
 *     loadClientsFromMongo()  -- read aggregated clients (legacy fallback only)
 *
 * Collections:
 *   ciq_raw_claims    -- raw Databricks rows (written by sync.ts)
 *   ciq_sync_pointer  -- single doc tracking latest syncId
 *   ciq_clients       -- aggregated client records (optional persist)
 *   ciq_load_history  -- load log
 */

const mongoose = require('mongoose');

let _connected = false;

// ── SCHEMAS ──────────────────────────────────────────────────────

const RawClaimSchema = new mongoose.Schema({
  syncId:   { type: String, required: true, index: true },
  rowIndex: Number,
  data:     mongoose.Schema.Types.Mixed,
}, { collection: 'ciq_raw_claims', timestamps: false });

RawClaimSchema.index({ syncId: 1, rowIndex: 1 });

const SyncPointerSchema = new mongoose.Schema({
  _id:       { type: String, default: 'latest' },
  syncId:    String,
  syncedAt:  Date,
  totalRows: Number,
}, { collection: 'ciq_sync_pointer' });

const ClientSchema = new mongoose.Schema({
  clientId:      { type: String, required: true, index: true },
  name:          { type: String, required: true },
  policyYear:    { type: String, index: true },
  source:        { type: String, default: 'excel' },
  loadedAt:      { type: Date,   default: Date.now },
  members:       Number, pmpy: Number, pmpm: Number,
  trendPct:      Number, chronicPct: Number, riskScore: Number,
  compositeScore: Number, clientStatus: String,
  totalCost:     Number, totalBilled: Number, totalClaims: Number,
  avgAge:        Number, currency: { type: String, default: '₱' },
  analytics:     mongoose.Schema.Types.Mixed,
  meta:          mongoose.Schema.Types.Mixed,
}, { collection: 'ciq_clients', timestamps: true });

ClientSchema.index({ clientId: 1, policyYear: 1 });

const LoadHistorySchema = new mongoose.Schema({
  source:       String, filePath: String,
  totalClients: Number, totalClaims: Number,
  policyYears:  [String], loadTimeMs: Number,
  status:       { type: String, default: 'success' }, error: String,
}, { collection: 'ciq_load_history', timestamps: true });

let _models = {};

function getModels() {
  if (!_models.Client) {
    _models.RawClaim    = mongoose.model('CiqRawClaim',    RawClaimSchema);
    _models.SyncPointer = mongoose.model('CiqSyncPointer', SyncPointerSchema);
    _models.Client      = mongoose.model('CiqClient',      ClientSchema);
    _models.LoadHistory = mongoose.model('CiqLoadHistory', LoadHistorySchema);
  }
  return _models;
}

// ── CONNECT ──────────────────────────────────────────────────────
async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  const db  = process.env.MONGODB_DB || 'healthiqDev';

  if (!uri) { console.warn('[mongo] MONGODB_URI not set -- MongoDB disabled'); return false; }
  if (_connected) return true;

  try {
    await mongoose.connect(uri, { dbName: db, serverSelectionTimeoutMS: 8000 });
    _connected = true;
    const host = uri.includes('@') ? uri.split('@')[1].split('/')[0] : 'localhost';
    console.log(`[mongo] ✓ Connected  db=${db}  host=${host}`);
    getModels();
    return true;
  } catch (e) {
    console.warn('[mongo] ✗ Connection failed:', e.message);
    return false;
  }
}

function isConnected() { return _connected && mongoose.connection.readyState === 1; }

// ── READ RAW CLAIMS ── primary data path for npm run dev ─────────
/**
 * Reads the latest synced raw claim rows from ciq_raw_claims.
 * Returns plain row objects ready for aggregateClaimsToClients().
 */
async function loadRawClaimsFromMongo() {
  if (!isConnected()) return null;
  const { RawClaim, SyncPointer } = getModels();

  try {
    const pointer = await SyncPointer.findById('latest').lean();
    if (!pointer || !pointer.syncId) {
      console.warn('[mongo] No sync pointer found -- run: npm run sync');
      return null;
    }

    const { syncId, totalRows, syncedAt } = pointer;
    console.log(`[mongo] Loading raw claims  syncId=${syncId}  rows≈${(totalRows||'?').toLocaleString()}  synced=${syncedAt}`);

    const docs = await RawClaim
      .find({ syncId }, { data: 1, _id: 0 })
      .lean()
      .limit(600000);

    if (!docs.length) {
      console.warn(`[mongo] No raw claim rows found for syncId=${syncId}`);
      return null;
    }

    const rows = docs.map(d => d.data);
    console.log(`[mongo] ✓ Loaded ${rows.length.toLocaleString()} raw rows from MongoDB (syncId=${syncId})`);
    return { rows, syncId, syncedAt, totalRows: rows.length };
  } catch (e) {
    console.error('[mongo] loadRawClaimsFromMongo failed:', e.message);
    return null;
  }
}

// ── PERSIST AGGREGATED CLIENTS (optional audit trail) ────────────
async function persistClients(clients, meta = {}) {
  if (!isConnected()) { console.warn('[mongo] Not connected -- skipping persist'); return false; }
  const { Client, LoadHistory } = getModels();
  const t0 = Date.now();
  try {
    const ops = clients.map(c => ({
      updateOne: {
        filter: { clientId: c.id, policyYear: meta.policyYear || c.analytics?.latestPolicyYear || 'all' },
        update: { $set: {
          clientId: c.id, name: c.name,
          policyYear:     meta.policyYear || c.analytics?.latestPolicyYear || 'all',
          source:         meta.source || 'mongo-raw',
          loadedAt:       new Date(),
          members:        c.members,    pmpy:          c.pmpy,
          pmpm:           c.pmpm,       trendPct:      c.trendPct,
          chronicPct:     c.chronicPct, riskScore:     c.riskScore,
          compositeScore: c.compositeScore, clientStatus: c.clientStatus,
          totalCost:      c.totalCost,  totalBilled:   c.totalBilled,
          totalClaims:    c.totalClaims, avgAge:        c.avgAge,
          currency:       c.currency,   analytics:     c.analytics,
          meta,
        }},
        upsert: true,
      }
    }));
    const result  = await Client.bulkWrite(ops, { ordered: false });
    const elapsed = Date.now() - t0;
    console.log(`[mongo] ✓ Persisted ${clients.length} clients in ${elapsed}ms`);
    await LoadHistory.create({
      source: meta.source || 'mongo-raw', filePath: meta.filePath || '',
      totalClients: clients.length, totalClaims: meta.totalClaims || null,
      policyYears: meta.policyYears || [], loadTimeMs: elapsed,
    });
    return true;
  } catch (e) { console.error('[mongo] Persist failed:', e.message); return false; }
}

// ── LOAD AGGREGATED CLIENTS (legacy fallback) ────────────────────
async function loadClientsFromMongo(filter = {}) {
  if (!isConnected()) return null;
  const { Client } = getModels();
  try {
    const docs = await Client.find(filter).lean().limit(1000);
    if (!docs.length) return null;
    const clients = docs.map(d => ({
      id: d.clientId, name: d.name, members: d.members, pmpy: d.pmpy,
      pmpm: d.pmpm, trendPct: d.trendPct, chronicPct: d.chronicPct,
      riskScore: d.riskScore, compositeScore: d.compositeScore,
      clientStatus: d.clientStatus, totalCost: d.totalCost,
      totalBilled: d.totalBilled, totalClaims: d.totalClaims,
      avgAge: d.avgAge, currency: d.currency || '₱',
      industry: 'HMO / Corporate Health', country: 'Philippines',
      meetingDate: '', manager: '', renewalDate: '', renewalOverdue: false,
      analytics: d.analytics,
    }));
    console.log(`[mongo] ✓ Loaded ${clients.length} aggregated clients`);
    return {
      clients, stories: [], narratives: {}, claimsData: null, sheets: {},
      meta: { source: 'mongodb', parsedAt: new Date().toISOString(),
        totalClients: clients.length, totalClaims: null,
        dataFormat: 'hmo-claims-level', currency: '₱',
        sheetNames: [], primaryKey: '', filePath: '', loadedFromMongo: true },
    };
  } catch (e) { console.error('[mongo] Load aggregated clients failed:', e.message); return null; }
}

// ── HISTORY ──────────────────────────────────────────────────────
async function getLoadHistory(limit = 20) {
  if (!isConnected()) return [];
  try { return await _models.LoadHistory.find().sort({ createdAt: -1 }).limit(limit).lean(); }
  catch (e) { return []; }
}

async function getSyncHistory(limit = 10) {
  if (!isConnected()) return [];
  try {
    const SyncHistory = mongoose.models['CiqSyncHistory'] ||
      mongoose.model('CiqSyncHistory', new mongoose.Schema({
        syncId: String, totalRows: Number, durationMs: Number,
        status: String, error: String, table: String,
      }, { collection: 'ciq_sync_history', timestamps: true }));
    return await SyncHistory.find().sort({ createdAt: -1 }).limit(limit).lean();
  } catch (e) { return []; }
}

// ── TEST ─────────────────────────────────────────────────────────
async function testMongoConnection() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return { success: false, message: 'MONGODB_URI not set in .env', configured: false };
  try {
    if (!isConnected()) await connectMongo();
    const { Client, RawClaim, SyncPointer } = getModels();
    const [clientCount, rawCount, pointer] = await Promise.all([
      Client.countDocuments(),
      RawClaim.countDocuments(),
      SyncPointer.findById('latest').lean(),
    ]);
    return {
      success: true, configured: true, message: 'MongoDB Atlas connected',
      db: process.env.MONGODB_DB || 'healthiqDev',
      clientsInDb: clientCount, rawClaimsInDb: rawCount,
      latestSync: pointer
        ? { syncId: pointer.syncId, syncedAt: pointer.syncedAt, totalRows: pointer.totalRows }
        : null,
    };
  } catch (e) { return { success: false, configured: true, message: e.message }; }
}

module.exports = {
  connectMongo, isConnected,
  loadRawClaimsFromMongo,  // ← PRIMARY: server reads this on boot
  persistClients,          // ← optional audit trail
  loadClientsFromMongo,    // ← legacy fallback
  getLoadHistory, getSyncHistory,
  testMongoConnection,
};
