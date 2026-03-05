// @ts-nocheck
/**
 * dataParser.ts -- HMO Claims Data Parser
 * ─────────────────────────────────────────
 * Priority:
 *   1. JSON cache  (dataFile/claimsiq_cache.json)  ← fastest, from npm run sync
 *   2. Excel file  (dataFile/Insurence.xlsx)        ← dev fallback
 *
 * JSON cache is NEVER committed to GitHub (in .gitignore)
 * On a new environment: npm run sync
 */

const path     = require('path');
const fs       = require('fs');
const XLSX     = require('xlsx');
const chokidar = require('chokidar');
const { aggregateClaimsToClients, isClaimsLevelData } = require('./claimsCalculator');

const JSON_CACHE = path.resolve(__dirname, '../dataFile/claimsiq_cache.json');

let cache = null;

// ── CACHE MANAGEMENT ─────────────────────────────────────────
function getCache()     { if (!cache) throw new Error('No data loaded. Run: npm run sync'); return cache; }
function clearCache()   { cache = null; console.log('[parser] Cache cleared.'); }
function setCache(data) { cache = data; console.log(`[parser] Cache set — ${data?.clients?.length ?? 0} clients`); }

// ── JSON CACHE ────────────────────────────────────────────────
function isJsonCacheAvailable() { return fs.existsSync(JSON_CACHE); }

function getJsonCacheMeta() {
  if (!fs.existsSync(JSON_CACHE)) return null;
  try {
    // Read only first 300 bytes — fast, no need to parse whole file
    const fd  = fs.openSync(JSON_CACHE, 'r');
    const buf = Buffer.alloc(300);
    fs.readSync(fd, buf, 0, 300, 0);
    fs.closeSync(fd);
    const s  = buf.toString('utf8');
    const syncedAt     = (s.match(/"syncedAt"\s*:\s*"([^"]+)"/)     || [])[1] || null;
    const totalClients = (s.match(/"totalClients"\s*:\s*(\d+)/)      || [])[1] || null;
    const totalClaims  = (s.match(/"totalClaims"\s*:\s*(\d+)/)       || [])[1] || null;
    return {
      syncedAt,
      totalClients: totalClients ? parseInt(totalClients) : null,
      totalClaims:  totalClaims  ? parseInt(totalClaims)  : null,
      fileSizeKb:   (fs.statSync(JSON_CACHE).size / 1024).toFixed(1),
    };
  } catch (e) { return null; }
}

function loadJsonCache() {
  if (!isJsonCacheAvailable()) {
    throw new Error(`Cache not found: ${JSON_CACHE}\nRun: npm run sync`);
  }
  console.log(`[parser] Reading JSON cache...`);
  const t0 = Date.now();

  const raw       = fs.readFileSync(JSON_CACHE, 'utf8');
  const data      = JSON.parse(raw);
  const clients   = data.clients || [];
  const policyYrs = data.policyYears ||
    [...new Set(clients.map(c => c.analytics?.latestPolicyYear).filter(Boolean))];

  console.log(`[parser] ✓ Loaded ${clients.length} clients in ${Date.now()-t0}ms`);
  console.log(`[parser]   Synced : ${data.syncedAt || 'unknown'}`);
  console.log(`[parser]   Claims : ${(data.totalClaims||0).toLocaleString()}`);

  cache = {
    clients,
    stories:    [],
    narratives: {},
    claimsData: null,
    sheets:     {},
    meta: {
      source:       'json_cache',
      parsedAt:     new Date().toISOString(),
      syncedAt:     data.syncedAt    || null,
      filePath:     JSON_CACHE,
      totalClients: clients.length,
      totalClaims:  data.totalClaims || null,
      policyYears:  policyYrs,
      dataFormat:   'hmo-claims-level',
      currency:     '₱',
      sheetNames:   [],
      primaryKey:   '',
    },
  };
  return cache;
}

// ── EXCEL HELPERS ─────────────────────────────────────────────
function sanitizeKey(key) {
  return String(key).trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
}
function castValue(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  const n   = Number(str.replace(/[₱$,%]/g,'').replace(/,/g,''));
  return (!isNaN(n) && str !== '') ? n : str;
}
function readSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const raw     = XLSX.utils.sheet_to_json(sheet, { defval:null, raw:false, header:1 });
  if (raw.length < 2) return [];
  const headers = raw[0].map((h,i) => h ? sanitizeKey(h) : `col_${i}`);
  return raw.slice(1)
    .map(row => { const o={}; headers.forEach((h,i) => { o[h]=castValue(row[i]); }); return o; })
    .filter(r => Object.values(r).some(v => v !== null && v !== ''));
}
function buildNarratives(allSheets) {
  const narratives = {};
  const narRows = allSheets['narratives'] || allSheets['narrative'] || [];
  narRows.forEach(r => {
    const id = String(r.story_id||r.id||'').trim();
    if (!id) return;
    narratives[id] = {
      headline: String(r.headline||''), insight: String(r.insight||''),
      so_what:  String(r.so_what||r.sowhat||''),
      talking_points: String(r.talking_points||'').split('|').map(s=>s.trim()).filter(Boolean),
      metrics: [], chart: { labels:[], values:[] },
    };
  });
  return narratives;
}

// ── EXCEL READER ──────────────────────────────────────────────
function parseXlsx(filePath) {
  const absPath = path.resolve(filePath);
  console.log(`[parser] Reading Excel: ${absPath}`);
  const workbook   = XLSX.readFile(absPath);
  const sheetNames = workbook.SheetNames;
  const allSheets  = {};
  sheetNames.forEach(n => { allSheets[sanitizeKey(n)] = readSheet(workbook, n); });

  const KNOWN = ['insurance_indicators','insuranceindicators','claims_data','claimsdata',
    'data','claims','sheet1','clients','client','accounts','insurance_data','insurence'];
  const primaryKey  = KNOWN.find(k => allSheets[k]) || sanitizeKey(sheetNames[0]);
  const primaryRows = allSheets[primaryKey] || [];

  console.log(`[parser] Sheet: "${primaryKey}" | ${primaryRows.length} rows`);
  let clients, claimsData = null;

  if (isClaimsLevelData(primaryRows)) {
    clients    = aggregateClaimsToClients(primaryRows);
    claimsData = primaryRows;
    console.log(`[parser] ✓ ${primaryRows.length} claims → ${clients.length} clients`);
  } else {
    const keys  = Object.keys(primaryRows[0]||{});
    const idCol = ['id','client_id','clientid'].find(k=>keys.includes(k))||keys[0];
    clients = primaryRows.map((r,i) => ({
      id: r[idCol]!=null ? String(r[idCol]) : `client_${i}`, ...r,
    }));
  }

  const policyYears = [...new Set(clients.map(c=>c.analytics?.latestPolicyYear).filter(Boolean))];
  cache = {
    clients, stories:[], narratives:buildNarratives(allSheets),
    claimsData, sheets:allSheets,
    meta: {
      sheetNames, primaryKey, source:'excel',
      parsedAt: new Date().toISOString(), filePath: absPath,
      totalClients: clients.length, totalClaims: claimsData?.length||null,
      dataFormat: claimsData ? 'hmo-claims-level':'summarised',
      currency:'₱', policyYears,
    },
  };
  console.log(`[parser] ✓ Done — ${clients.length} clients`);
  return cache;
}

// ── WATCHER ───────────────────────────────────────────────────
function startWatcher(filePath) {
  const watcher = chokidar.watch(filePath, {
    persistent:true, ignoreInitial:true,
    awaitWriteFinish:{ stabilityThreshold:800, pollInterval:100 },
  });
  watcher.on('change', () => {
    console.log('[watcher] File changed — reloading...');
    clearCache();
    try { parseXlsx(filePath); } catch(e) { console.error('[watcher]',e.message); }
  });
  console.log(`[watcher] Watching: ${path.resolve(filePath)}`);
}

module.exports = {
  parseXlsx, loadJsonCache, isJsonCacheAvailable, getJsonCacheMeta,
  getCache, clearCache, startWatcher, _setCache: setCache,
};
