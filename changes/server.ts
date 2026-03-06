// @ts-nocheck
/**
 * server.ts -- ClaimsIQ API Server  v3.1
 * ────────────────────────────────────────
 * Boot priority (npm run dev):
 *   1. MongoDB raw claims  → run aggregateClaimsToClients() locally
 *   2. Excel file fallback (if no MongoDB data)
 *   3. Exit with helpful error
 *
 * NO JSON file storage. NO direct Databricks calls on boot.
 * Databricks data comes through:  npm run sync → MongoDB → here
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');
const fs      = require('fs');

const { parseXlsx, getCache, clearCache, startWatcher } = require('./dataParser');
const { generateAiAnalysis, clearAiCache, getAiCacheStatus, deleteAiCacheEntry } = require('./aiAnalyzer');
const { aggregateClaimsToClients } = require('./claimsCalculator');
const {
  connectMongo, isConnected: isMongoConnected,
  loadRawClaimsFromMongo,
  persistClients,
  loadClientsFromMongo,
  testMongoConnection,
  getLoadHistory, getSyncHistory,
} = require('./mongoConnector');

const app        = express();
const PORT       = process.env.PORT      || 3001;
const XLSX_PATH  = process.env.XLSX_FILE || 'dataFile/Insurence.xlsx';
const PERSIST    = process.env.MONGO_PERSIST !== 'false';

let _cache       = null;   // our in-memory cache (MongoDB path)
let activeSource = 'none';

// ── MIDDLEWARE ────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: ['http://localhost:3000','http://localhost:3001','http://localhost:5173'],
  credentials: true,
}));
app.use(express.json());
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// ── CACHE ─────────────────────────────────────────────────────────
function getActiveCache() {
  if (_cache) return _cache;
  return getCache(); // Excel parser cache
}

// ── LOAD FROM MONGODB RAW CLAIMS ─────────────────────────────────
async function loadFromMongo() {
  const result = await loadRawClaimsFromMongo();
  if (!result) return false;

  const { rows, syncId, syncedAt } = result;
  console.log(`[boot] Aggregating ${rows.length.toLocaleString()} raw rows...`);
  const t0      = Date.now();
  const clients = aggregateClaimsToClients(rows);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[boot] ${clients.length} clients in ${elapsed}s`);

  const policyYears = [...new Set(clients.map(c => c.analytics?.latestPolicyYear).filter(Boolean))];
  _cache = {
    clients, stories: [], narratives: {}, claimsData: null, sheets: {},
    meta: {
      source: 'mongodb', syncId, syncedAt,
      parsedAt: new Date().toISOString(),
      totalClients: clients.length, totalClaims: rows.length,
      dataFormat: 'hmo-claims-level', currency: 'P',
      policyYears, sheetNames: [], primaryKey: '', filePath: '',
    },
  };
  activeSource = 'mongodb';
  return true;
}

// ── LOAD EXCEL FALLBACK ───────────────────────────────────────────
function loadExcel() {
  const abs = path.resolve(XLSX_PATH);
  if (!fs.existsSync(abs)) return false;
  try {
    parseXlsx(XLSX_PATH);
    _cache = null;
    activeSource = 'excel';
    console.log('[boot] Excel loaded');
    return true;
  } catch (e) { console.error('[boot] Excel failed:', e.message); return false; }
}

async function maybePersist(clients, meta) {
  if (!PERSIST || !isMongoConnected()) return;
  const policyYears = [...new Set(clients.map(c => c.analytics?.latestPolicyYear).filter(Boolean))];
  await persistClients(clients, {
    source: meta?.source || activeSource, filePath: meta?.filePath || '',
    totalClaims: meta?.totalClaims || null, policyYears, policyYear: policyYears[0] || 'all',
  });
}

// ── ROUTES: System ────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({
  success: true, status: 'ok', time: new Date().toISOString(),
  dataSource: activeSource, mongoConnected: isMongoConnected(),
}));

app.get('/api/source', (_, res) => {
  let meta = {};
  try { meta = getActiveCache().meta || {}; } catch {}
  res.json({
    success: true, activeSource,
    xlsxAvailable:  fs.existsSync(path.resolve(XLSX_PATH)),
    mongoConnected: isMongoConnected(), meta,
  });
});

app.get('/api/mongo/status',       async (_, res) => res.json(await testMongoConnection()));
app.get('/api/mongo/history',      async (_, res) => res.json({ success: true, history: await getLoadHistory() }));
app.get('/api/mongo/sync-history', async (_, res) => res.json({ success: true, history: await getSyncHistory() }));

// ── ROUTES: Data ──────────────────────────────────────────────────
app.get('/api/all', (_, res) => {
  try {
    const { clients, stories, narratives, meta } = getActiveCache();
    res.json({ success: true, clients, stories, narratives, meta, dataSource: activeSource });
  } catch (e) { res.status(503).json({ success: false, error: e.message }); }
});

app.get('/api/clients', (_, res) => {
  try {
    const { clients } = getActiveCache();
    res.json({ success: true, count: clients.length, data: clients, dataSource: activeSource });
  } catch (e) { res.status(503).json({ success: false, error: e.message }); }
});

app.get('/api/client/:id', (req, res) => {
  try {
    const { clients } = getActiveCache();
    const c = clients.find(c => String(c.id).toLowerCase() === req.params.id.toLowerCase());
    if (!c) return res.status(404).json({ success: false, error: `Client "${req.params.id}" not found.` });
    res.json({ success: true, data: c, dataSource: activeSource });
  } catch (e) { res.status(503).json({ success: false, error: e.message }); }
});

// ── ROUTES: Reload ────────────────────────────────────────────────
app.post('/api/reload', async (req, res) => {
  try {
    clearAiCache();
    if (isMongoConnected()) {
      const ok = await loadFromMongo();
      if (!ok) return res.status(503).json({ success: false, error: 'No synced data. Run: npm run sync' });
    } else {
      clearCache(); parseXlsx(XLSX_PATH);
    }
    const cache = getActiveCache();
    await maybePersist(cache.clients, cache.meta);
    res.json({ success: true, message: `Reloaded from ${activeSource}.`, meta: cache.meta });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/reload/mongo', async (req, res) => {
  try {
    clearAiCache();
    const ok = await loadFromMongo();
    if (!ok) return res.status(503).json({ success: false, error: 'No synced data. Run: npm run sync first.' });
    const cache = getActiveCache();
    await maybePersist(cache.clients, cache.meta);
    res.json({ success: true, message: 'Re-aggregated from MongoDB raw claims.', meta: cache.meta });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/reload/excel', async (req, res) => {
  try {
    clearCache(); clearAiCache(); _cache = null;
    const ok = loadExcel();
    if (!ok) return res.status(404).json({ success: false, error: `Excel not found: ${path.resolve(XLSX_PATH)}` });
    res.json({ success: true, message: 'Reloaded from Excel.', meta: getActiveCache().meta });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── ROUTES: AI ────────────────────────────────────────────────────
app.post('/api/ai/analyze', async (req, res) => {
  const { clientId, storyId, forceRefresh = false } = req.body;
  if (!clientId || !storyId)
    return res.status(400).json({ success: false, error: 'clientId and storyId required.' });

  let cacheData;
  try { cacheData = getActiveCache(); }
  catch (e) { return res.status(503).json({ success: false, error: e.message }); }

  const client = cacheData.clients.find(c =>
    String(c.id).toLowerCase() === String(clientId).toLowerCase()
  );
  if (!client)
    return res.status(404).json({ success: false, error: `Client "${clientId}" not found.` });

  const xlsxMetrics = cacheData.narratives?.[storyId]?.metrics || [];
  if (forceRefresh) deleteAiCacheEntry(`${clientId}_${storyId}`);

  try {
    const result = await generateAiAnalysis({ client, storyId, xlsxMetrics });
    res.json({ success: true, clientId, storyId, fromCache: result.fromCache, dataSource: activeSource, analysis: result });
  } catch (e) {
    res.status(500).json({
      success: false, error: e.message,
      hint: e.message.includes('OPENROUTER_API_KEY')
        ? 'Add OPENROUTER_API_KEY to backend/.env' : 'AI failed -- check logs',
    });
  }
});

app.get('/api/ai/cache',    (_, res) => res.json({ success: true, ...getAiCacheStatus() }));
app.delete('/api/ai/cache', (_, res) => { clearAiCache(); res.json({ success: true, message: 'AI cache cleared.' }); });

app.get('/api/debug/columns', (_, res) => {
  try {
    const cache = getActiveCache();
    res.json({
      success: true, dataSource: activeSource,
      totalClients: cache.clients.length,
      meta: cache.meta,
    });
  } catch (e) { res.status(503).json({ success: false, error: e.message }); }
});

app.use((req, res) => res.status(404).json({ success: false, error: `Not found: ${req.method} ${req.url}` }));
app.use((err, _req, res, _next) => res.status(500).json({ success: false, error: 'Internal error.' }));

// ── BOOT ──────────────────────────────────────────────────────────
async function boot() {
  console.log('\n==============================================');
  console.log('  Marsh ClaimsIQ v3.1 -- API Server');
  console.log('==============================================\n');

  await connectMongo();

  if (isMongoConnected()) {
    console.log('[boot] MongoDB connected -- loading raw claims...');
    const ok = await loadFromMongo();

    if (ok) {
      await maybePersist(getActiveCache().clients, getActiveCache().meta);
    } else {
      console.warn('[boot] No synced data in MongoDB. Trying Excel fallback...');
      const xlsxOk = loadExcel();
      if (!xlsxOk) {
        console.error('[boot] No data available.');
        console.error('[boot]   Run: npm run sync   -- to sync Databricks into MongoDB');
        console.error('[boot]   Or place .xlsx at:  backend/' + XLSX_PATH);
        process.exit(1);
      }
      startWatcher(XLSX_PATH);
    }
  } else {
    console.warn('[boot] MongoDB not available. Trying Excel...');
    const xlsxOk = loadExcel();
    if (!xlsxOk) {
      console.error('[boot] No data source. Set MONGODB_URI in .env and run: npm run sync');
      process.exit(1);
    }
    startWatcher(XLSX_PATH);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    console.warn('[boot] OPENROUTER_API_KEY not set -- AI disabled');
  } else {
    console.log(`[boot] AI: ${process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct'}`);
  }

  app.listen(PORT, () => {
    console.log(`\nServer   http://localhost:${PORT}`);
    console.log(`Source:  ${activeSource.toUpperCase()}`);
    console.log(`Mongo:   ${isMongoConnected() ? 'Connected' : 'Disconnected'}\n`);
  });
}

boot();
