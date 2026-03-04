// @ts-nocheck
/**
 * dataParser.ts -- HMO Claims Data Parser
 * ----------------------------------------
 * Reads Excel (.xlsx) OR Parquet cache file and aggregates claim-level data.
 * Priority: Parquet cache > Excel > raw aggregation
 *
 * Parquet file path: backend/dataFile/claimsiq_cache.parquet
 * Parquet meta path: backend/dataFile/claimsiq_cache_meta.json
 */

const path     = require('path');
const fs       = require('fs');
const XLSX     = require('xlsx');
const chokidar = require('chokidar');
const parquet  = require('parquetjs-lite');

const { aggregateClaimsToClients, isClaimsLevelData, normalizeRow } = require('./claimsCalculator');

// ── FILE PATHS ────────────────────────────────────────────────
const PARQUET_FILE = path.resolve(__dirname, '../dataFile/claimsiq_cache.parquet');
const PARQUET_META = path.resolve(__dirname, '../dataFile/claimsiq_cache_meta.json');

let cache = null;

// ── CACHE MANAGEMENT ─────────────────────────────────────────
function getCache() {
  if (!cache) throw new Error('Data not loaded -- call parseXlsx() or loadParquet() first.');
  return cache;
}
function clearCache() { cache = null; console.log('[parser] Cache cleared.'); }
function setCache(data) {
  cache = data;
  console.log(`[parser] Cache injected externally — ${data?.clients?.length ?? 0} clients`);
}

// ── PARQUET READER ────────────────────────────────────────────
function isParquetAvailable() {
  return fs.existsSync(PARQUET_FILE);
}

function getParquetMeta() {
  try {
    if (fs.existsSync(PARQUET_META)) {
      return JSON.parse(fs.readFileSync(PARQUET_META, 'utf8'));
    }
  } catch (e) {}
  return null;
}

async function loadParquet() {
  if (!isParquetAvailable()) {
    throw new Error(`Parquet file not found: ${PARQUET_FILE}\nRun: npm run sync`);
  }

  console.log(`[parser] Reading parquet: ${PARQUET_FILE}`);
  const t0 = Date.now();

  try {
    const reader  = await parquet.ParquetReader.openFile(PARQUET_FILE);
    const cursor  = reader.getCursor();
    const clients = [];
    let   row;

    while ((row = await cursor.next()) !== null) {
      // Parse the analytics JSON blob back into an object
      let analytics = {};
      try {
        analytics = JSON.parse(row.analyticsJson || '{}');
      } catch (e) {
        console.warn(`[parser] Analytics JSON parse failed for: ${row.name}`);
      }

      clients.push({
        id:          String(row.id          || ''),
        name:        String(row.name        || ''),
        members:     Number(row.members     || 0),
        pmpy:        Number(row.pmpy        || 0),
        pmpm:        Number(row.pmpm        || 0),
        trendPct:    Number(row.trendPct    || 0),
        chronicPct:  Number(row.chronicPct  || 0),
        riskScore:   Number(row.riskScore   || 0),
        totalCost:   Number(row.totalCost   || 0),
        totalBilled: Number(row.totalBilled || 0),
        totalClaims: Number(row.totalClaims || 0),
        avgAge:      Number(row.avgAge      || 0),
        industry:    String(row.industry    || 'HMO / Corporate Health'),
        country:     String(row.country     || 'Philippines'),
        currency:    String(row.currency    || '₱'),
        meetingDate: '',
        manager:     '',
        renewalDate: '',
        renewalOverdue: false,
        analytics,
      });
    }

    await reader.close();

    const elapsed = Date.now() - t0;
    const parquetMeta = getParquetMeta();

    console.log(`[parser] ✓ Parquet loaded — ${clients.length} clients in ${elapsed}ms`);
    if (parquetMeta?.exportedAt) {
      console.log(`[parser]   Exported at: ${parquetMeta.exportedAt}`);
      console.log(`[parser]   Source: Databricks | Claims: ${(parquetMeta.totalClaims || 0).toLocaleString()}`);
    }

    const policyYears = [
      ...new Set(clients.map(c => c.analytics?.latestPolicyYear).filter(Boolean))
    ];

    cache = {
      clients,
      stories:    [],
      narratives: {},
      claimsData: null,
      sheets:     {},
      meta: {
        source:        'parquet',
        parsedAt:      new Date().toISOString(),
        filePath:      PARQUET_FILE,
        exportedAt:    parquetMeta?.exportedAt || null,
        totalClients:  clients.length,
        totalClaims:   parquetMeta?.totalClaims || null,
        dataFormat:    'hmo-claims-level',
        currency:      '₱',
        policyYears,
        sheetNames:    [],
        primaryKey:    '',
        loadTimeMs:    elapsed,
      },
    };

    return cache;

  } catch (e) {
    throw new Error(`Parquet read failed: ${e.message}`);
  }
}

// ── EXCEL HELPERS ─────────────────────────────────────────────
function sanitizeKey(key) {
  return String(key).trim().toLowerCase()
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function castValue(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  const n   = Number(str.replace(/[₱$,%]/g, '').replace(/,/g, ''));
  if (!isNaN(n) && str !== '') return n;
  return str;
}

function readSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false, header: 1 });
  if (raw.length < 2) return [];
  const headers = raw[0].map((h, i) => h ? sanitizeKey(h) : `col_${i}`);
  return raw.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = castValue(row[i]); });
      return obj;
    })
    .filter(r => Object.values(r).some(v => v !== null && v !== ''));
}

function buildNarratives(allSheets) {
  const narratives = {};
  const narRows = allSheets['narratives'] || allSheets['narrative'] || [];
  narRows.forEach(r => {
    const id = String(r.story_id || r.id || '').trim();
    if (!id) return;
    narratives[id] = {
      headline:       String(r.headline       || ''),
      insight:        String(r.insight        || ''),
      so_what:        String(r.so_what        || r.sowhat || ''),
      talking_points: String(r.talking_points || r.talkingpoints || '')
        .split('|').map(s => s.trim()).filter(Boolean),
      metrics: [], chart: { labels: [], values: [] },
      chartColor: String(r.chart_color || r.chartcolor || '#c8830a'),
    };
  });
  const metRows = allSheets['metrics'] || allSheets['kpis'] || [];
  metRows.forEach(r => {
    const id = String(r.story_id || r.id || '').trim();
    if (!id || !narratives[id]) return;
    narratives[id].metrics.push({
      label: String(r.label || ''), value: String(r.value || ''),
      delta: r.delta != null ? String(r.delta) : undefined,
      bench: r.bench != null ? String(r.bench) : undefined,
      benchLabel: r.bench_label ? String(r.bench_label) : undefined,
      dir: String(r.dir || 'neutral'),
    });
  });
  return narratives;
}

// ── EXCEL READER ──────────────────────────────────────────────
function parseXlsx(filePath) {
  const absPath = path.resolve(filePath);
  console.log(`[parser] Reading Excel: ${absPath}`);

  const workbook   = XLSX.readFile(absPath);
  const sheetNames = workbook.SheetNames;
  console.log(`[parser] Sheets: ${sheetNames.join(', ')}`);

  const allSheets = {};
  sheetNames.forEach(name => { allSheets[sanitizeKey(name)] = readSheet(workbook, name); });

  const KNOWN_PRIMARY = [
    'insurance_indicators','insuranceindicators','claims_data','claimsdata',
    'data','claims','sheet1','clients','client','accounts','insurance_data','insurence',
  ];
  const primaryKey  = KNOWN_PRIMARY.find(k => allSheets[k]) || sanitizeKey(sheetNames[0]);
  const primaryRows = allSheets[primaryKey] || [];

  console.log(`[parser] Primary: "${primaryKey}" | ${primaryRows.length} rows`);

  let clients, claimsData = null;

  if (isClaimsLevelData(primaryRows)) {
    console.log('[parser] ✓ HMO claim-level data -- aggregating by Entity...');
    clients    = aggregateClaimsToClients(primaryRows);
    claimsData = primaryRows;
    console.log(`[parser] ✓ ${primaryRows.length} claims -> ${clients.length} companies`);
  } else {
    console.log('[parser] ✓ Pre-summarised client data');
    const keys  = Object.keys(primaryRows[0] || {});
    const idCol = ['id','client_id','clientid','client_code','code'].find(k => keys.includes(k)) || keys[0];
    clients = primaryRows.map((r, i) => ({
      id: r[idCol] != null ? String(r[idCol]) : `client_${i}`, ...r,
    }));
  }

  const storyRows  = allSheets['stories'] || allSheets['story_templates'] || [];
  const stories    = storyRows.map(r => ({
    id: String(r.id || r.story_id || ''), icon: String(r.icon || '📊'),
    label: String(r.label || ''), desc: String(r.desc || r.description || ''),
  }));
  const narratives = buildNarratives(allSheets);
  const policyYears = [...new Set(clients.map(c => c.analytics?.latestPolicyYear).filter(Boolean))];

  cache = {
    clients, stories, narratives, claimsData, sheets: allSheets,
    meta: {
      sheetNames, primaryKey, parsedAt: new Date().toISOString(),
      filePath: absPath, totalClients: clients.length,
      totalClaims: claimsData ? claimsData.length : null,
      dataFormat: claimsData ? 'hmo-claims-level' : 'summarised',
      source: 'excel', currency: '₱', policyYears,
    },
  };

  console.log(`[parser] ✓ Done -- ${clients.length} clients | format: ${cache.meta.dataFormat}`);
  return cache;
}

// ── FILE WATCHER (Excel only) ─────────────────────────────────
function startWatcher(filePath) {
  const watcher = chokidar.watch(filePath, {
    persistent: true, ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
  });
  watcher.on('change', () => {
    console.log('[watcher] 📁 Excel changed -- reloading...');
    clearCache();
    try { parseXlsx(filePath); console.log('[watcher] ✓ Reloaded.'); }
    catch (e) { console.error('[watcher] ✗', e.message); }
  });
  watcher.on('error', err => console.error('[watcher]', err));
  console.log(`[watcher] 👁  Watching: ${path.resolve(filePath)}`);
}

module.exports = {
  parseXlsx,
  loadParquet,
  isParquetAvailable,
  getParquetMeta,
  getCache,
  clearCache,
  startWatcher,
  _setCache: setCache,
};
