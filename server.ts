// @ts-nocheck
/**
 * server.ts -- ClaimsIQ API Server
 * ─────────────────────────────────
 * Data source priority:
 *   1. Parquet cache file  (fastest — from daily Databricks sync)
 *   2. Excel file          (dev/demo fallback)
 *   3. Databricks direct   (slowest — only if FORCE_DATABRICKS=true)
 *   4. MongoDB Atlas       (optional persist layer)
 */
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');
const fs      = require('fs');

const {
  parseXlsx, loadParquet, isParquetAvailable, getParquetMeta,
  getCache, clearCache, startWatcher, _setCache,
} = require('./dataParser');

const {
  generateAiAnalysis, clearAiCache, getAiCacheStatus, deleteAiCacheEntry,
} = require('./aiAnalyzer');

const {
  loadDatabricksData, testDatabricksConnection, isDatabricksConfigured,
} = require('./databricksConnector');

const {
  connectMongo, persistClients, loadClientsFromMongo,
  testMongoConnection, getLoadHistory, isConnected: isMongoConnected,
} = require('./mongoConnector');

const app       = express();
const PORT      = process.env.PORT      || 3001;
const XLSX_PATH = process.env.XLSX_FILE || 'dataFile/Insurence.xlsx';
const FORCE_DB  = process.env.FORCE_DATABRICKS === 'true';
const PERSIST   = process.env.MONGO_PERSIST !== 'false';

let activeSource    = 'none';
let databricksCache = null;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: ['http://localhost:3000','http://localhost:3001','http://localhost:5173'],
  credentials: true,
}));
app.use(express.json());
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// ── ACTIVE CACHE RESOLVER ─────────────────────────────────────
function getActiveCache() {
  if (activeSource === 'databricks' && databricksCache) return databricksCache;
  return getCache();
}

// ── LOADERS ───────────────────────────────────────────────────
async function loadFromParquet() {
  if (!isParquetAvailable()) return false;
  try {
    await loadParquet();
    activeSource = 'parquet';
    const meta = getParquetMeta();
    if (meta?.exportedAt) {
      console.log(`[boot] 📦 Parquet exported: ${meta.exportedAt}`);
    }
    return true;
  } catch (e) {
    console.error('[boot] Parquet load failed:', e.message);
    return false;
  }
}

function loadExcel() {
  const abs = path.resolve(XLSX_PATH);
  if (!fs.existsSync(abs)) return false;
  try {
    parseXlsx(XLSX_PATH);
    activeSource = 'excel';
    return true;
  } catch (e) {
    console.error('[boot] Excel failed:', e.message);
    return false;
  }
}

async function loadDatabricks() {
  if (!isDatabricksConfigured()) {
    console.warn('[boot] Databricks not configured');
    return false;
  }
  try {
    databricksCache = await loadDatabricksData();
    activeSource    = 'databricks';
    return true;
  } catch (e) {
    console.error('[boot] Databricks failed:', e.message);
    return false;
  }
}

async function maybePersist(cache) {
  if (!PERSIST || !isMongoConnected()) return;
  const policyYears = [
    ...new Set(cache.clients.map(c => c.analytics?.latestPolicyYear).filter(Boolean))
  ];
  await persistClients(cache.clients, {
    source:      cache.meta?.source || activeSource,
    filePath:    cache.meta?.filePath || '',
    totalClaims: cache.meta?.totalClaims || null,
    policyYears,
    policyYear:  policyYears[0] || 'all',
  });
}

// ── ROUTES: System ────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({
  success: true, status: 'ok', time: new Date().toISOString(),
  dataSource: activeSource, mongoConnected: isMongoConnected(),
}));

app.get('/api/source', (_, res) => {
  let meta = {};
  try { meta = getActiveCache().meta || {}; } catch {}
  const parquetMeta = getParquetMeta();
  res.json({
    success: true, activeSource,
    xlsxAvailable:        fs.existsSync(path.resolve(XLSX_PATH)),
    parquetAvailable:     isParquetAvailable(),
    parquetExportedAt:    parquetMeta?.exportedAt || null,
    parquetTotalClients:  parquetMeta?.totalClients || null,
    parquetTotalClaims:   parquetMeta?.totalClaims || null,
    databricksConfigured: isDatabricksConfigured(),
    mongoConnected:       isMongoConnected(),
    meta,
  });
});

app.get('/api/databricks/status', async (_, res) => res.json(await testDatabricksConnection()));
app.get('/api/mongo/status',      async (_, res) => res.json(await testMongoConnection()));
app.get('/api/mongo/history',     async (_, res) => res.json({ success: true, history: await getLoadHistory() }));

// Parquet file info endpoint
app.get('/api/parquet/status', (_, res) => {
  const available = isParquetAvailable();
  const meta      = getParquetMeta();
  res.json({
    success:   true,
    available,
    meta:      meta || null,
    message:   available
      ? `Parquet cache available — exported ${meta?.exportedAt || 'unknown'}`
      : 'No parquet file found. Run: npm run sync',
  });
});

// ── ROUTES: Data ──────────────────────────────────────────────
app.get('/api/all', (_, res) => {
  try {
    const { clients, stories, narratives, meta } = getActiveCache();
    res.json({ success: true, clients, stories, narratives, meta, dataSource: activeSource });
  } catch (e) {
    res.status(503).json({ success: false, error: e.message });
  }
});

app.get('/api/clients', (_, res) => {
  try {
    const { clients } = getActiveCache();
    res.json({ success: true, count: clients.length, data: clients, dataSource: activeSource });
  } catch (e) {
    res.status(503).json({ success: false, error: e.message });
  }
});

app.get('/api/client/:id', (req, res) => {
  try {
    const { clients } = getActiveCache();
    const c = clients.find(c => String(c.id).toLowerCase() === req.params.id.toLowerCase());
    if (!c) return res.status(404).json({ success: false, error: `Client "${req.params.id}" not found.` });
    res.json({ success: true, data: c, dataSource: activeSource });
  } catch (e) {
    res.status(503).json({ success: false, error: e.message });
  }
});

app.get('/api/sheets', (_, res) => {
  try {
    const { sheets } = getActiveCache();
    res.json({
      success: true,
      sheets: Object.keys(sheets || {}).map(k => ({ key: k, count: sheets[k].length })),
    });
  } catch (e) {
    res.status(503).json({ success: false, error: e.message });
  }
});

// ── ROUTES: Reload ────────────────────────────────────────────
app.post('/api/reload', async (req, res) => {
  try {
    clearAiCache();
    if      (activeSource === 'databricks') { databricksCache = null; await loadDatabricks(); }
    else if (activeSource === 'parquet')    { await loadFromParquet(); }
    else                                    { clearCache(); parseXlsx(XLSX_PATH); }
    const cache = getActiveCache();
    await maybePersist(cache);
    res.json({ success: true, message: `Reloaded from ${activeSource}.`, meta: cache.meta });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/reload/parquet', async (req, res) => {
  try {
    clearCache(); clearAiCache();
    const ok = await loadFromParquet();
    if (!ok) {
      return res.status(404).json({
        success: false,
        error:   'Parquet file not found.',
        hint:    'Run: npm run sync  to generate it from Databricks',
      });
    }
    res.json({ success: true, message: 'Reloaded from parquet cache.', meta: getCache().meta });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/reload/excel', async (req, res) => {
  try {
    clearCache(); clearAiCache();
    const ok = loadExcel();
    if (!ok) {
      return res.status(404).json({
        success: false,
        error:  `Excel not found: ${path.resolve(XLSX_PATH)}`,
      });
    }
    const cache = getActiveCache();
    await maybePersist(cache);
    res.json({ success: true, message: 'Reloaded from Excel.', meta: cache.meta });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/reload/databricks', async (req, res) => {
  try {
    clearAiCache(); databricksCache = null;
    const ok = await loadDatabricks();
    if (!ok) return res.status(500).json({ success: false, error: 'Databricks load failed.' });
    await maybePersist(databricksCache);
    res.json({ success: true, message: 'Reloaded from Databricks.', meta: databricksCache.meta });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── ROUTES: AI ────────────────────────────────────────────────
app.post('/api/ai/analyze', async (req, res) => {
  const { clientId, storyId, forceRefresh = false } = req.body;
  if (!clientId || !storyId) {
    return res.status(400).json({ success: false, error: 'clientId and storyId required.' });
  }

  let cacheData;
  try { cacheData = getActiveCache(); }
  catch (e) { return res.status(503).json({ success: false, error: e.message }); }

  const client = cacheData.clients.find(
    c => String(c.id).toLowerCase() === String(clientId).toLowerCase()
  );
  if (!client) {
    return res.status(404).json({ success: false, error: `Client "${clientId}" not found.` });
  }

  const xlsxMetrics = cacheData.narratives?.[storyId]?.metrics || [];
  if (forceRefresh) deleteAiCacheEntry(`${clientId}_${storyId}`);

  try {
    const result = await generateAiAnalysis({ client, storyId, xlsxMetrics });
    res.json({
      success: true, clientId, storyId,
      fromCache: result.fromCache, dataSource: activeSource,
      analysis: result,
    });
  } catch (e) {
    res.status(500).json({
      success: false, error: e.message,
      hint: e.message.includes('OPENROUTER_API_KEY')
        ? 'Add OPENROUTER_API_KEY to backend/.env'
        : 'AI failed -- check logs',
    });
  }
});

app.get('/api/ai/cache',    (_, res) => res.json({ success: true, ...getAiCacheStatus() }));
app.delete('/api/ai/cache', (_, res) => { clearAiCache(); res.json({ success: true, message: 'AI cache cleared.' }); });

// ── DEBUG ─────────────────────────────────────────────────────
app.get('/api/debug/columns', (_, res) => {
  try {
    const cache  = getActiveCache();
    const result = {};
    Object.entries(cache.sheets || {}).forEach(([k, rows]) => {
      result[k] = { rowCount: rows.length, columns: rows.length ? Object.keys(rows[0]) : [], sample: rows[0] };
    });
    res.json({
      success: true, dataSource: activeSource,
      totalClients: cache.clients.length, sheets: result, meta: cache.meta,
    });
  } catch (e) {
    res.status(503).json({ success: false, error: e.message });
  }
});

app.use((req, res) => res.status(404).json({ success: false, error: `Not found: ${req.method} ${req.url}` }));
app.use((err, _req, res, _next) => res.status(500).json({ success: false, error: 'Internal error.' }));

// ── BOOT ──────────────────────────────────────────────────────
async function boot() {
  console.log('\n════════════════════════════════════════');
  console.log('  Marsh ClaimsIQ v3.0 -- API Server');
  console.log('════════════════════════════════════════\n');

  // MongoDB — optional, non-blocking
  await connectMongo();

  const xlsxExists    = fs.existsSync(path.resolve(XLSX_PATH));
  const parquetExists = isParquetAvailable();

  // ── Priority 1: Parquet cache (production default — fast) ──
  if (!FORCE_DB && parquetExists) {
    console.log('[boot] 📦 Parquet cache found — loading...');
    const ok = await loadFromParquet();
    if (!ok) {
      console.warn('[boot] Parquet failed — falling back to Excel');
      if (xlsxExists) { loadExcel(); }
      else { console.error('[boot] ✗ No data source available'); process.exit(1); }
    }

  // ── Priority 2: Excel (dev/demo fallback) ──────────────────
  } else if (!FORCE_DB && xlsxExists) {
    console.log('[boot] 📊 No parquet — using Excel file');
    const ok = loadExcel();
    if (!ok) { console.error('[boot] ✗ Excel parse failed'); process.exit(1); }
    startWatcher(XLSX_PATH);
    await maybePersist(getCache());

  // ── Priority 3: Databricks direct (slow, avoid in prod) ───
  } else {
    console.log(FORCE_DB
      ? '[boot] ⚡ FORCE_DATABRICKS=true — connecting directly...'
      : '[boot] ⚠  No parquet or Excel found — trying Databricks...'
    );
    console.warn('[boot]    This is slow (5-10 mins). Run: npm run sync');
    const ok = await loadDatabricks();
    if (!ok) {
      console.error('[boot] ✗ All data sources failed.');
      console.error('         Run: npm run sync   to generate parquet cache');
      console.error('         Or place Excel at: ' + XLSX_PATH);
      process.exit(1);
    }
    await maybePersist(databricksCache);
  }

  // AI key check
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    console.warn('[boot] ⚠  OPENROUTER_API_KEY not set -- AI disabled');
  } else {
    console.log(`[boot] 🤖 AI: ${process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct'}`);
  }

  app.listen(PORT, () => {
    console.log(`\n✅ Server  http://localhost:${PORT}`);
    console.log(`📊 Source: ${activeSource.toUpperCase()}`);
    console.log(`🍃 Mongo:  ${isMongoConnected() ? 'Connected' : 'Disconnected'}\n`);
  });
}

boot();
