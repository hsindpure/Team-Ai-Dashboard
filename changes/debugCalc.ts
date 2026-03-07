// @ts-nocheck
/**
 * debugCalc.ts -- Fast Calculation Debugger
 * ------------------------------------------
 * Pulls ONLY 500 rows from MongoDB (not 500k),
 * runs claimsCalculator on them, and prints a
 * full diagnostic report in ~3 seconds.
 *
 * Usage:
 *   npx ts-node --transpile-only src/debugCalc.ts
 *
 * Optional: filter to one client
 *   CLIENT=acme npx ts-node --transpile-only src/debugCalc.ts
 *
 * Optional: change sample size (default 500)
 *   SAMPLE=2000 npx ts-node --transpile-only src/debugCalc.ts
 */

require('dotenv').config();
const mongoose = require('mongoose');

const SAMPLE_SIZE = parseInt(process.env.SAMPLE || '500');
const CLIENT_FILTER = process.env.CLIENT || null;

async function main() {
  // ── 1. CONNECT ──────────────────────────────────────────────
  const uri = process.env.MONGODB_URI;
  const db  = process.env.MONGODB_DB || 'healthiqDev';
  if (!uri) { console.error('MONGODB_URI not set in .env'); process.exit(1); }

  console.log(`\n${'─'.repeat(60)}`);
  console.log('  ClaimsIQ Debug Calculator');
  console.log(`${'─'.repeat(60)}\n`);

  await mongoose.connect(uri, { dbName: db, serverSelectionTimeoutMS: 8000 });
  console.log(`✓ MongoDB connected  db=${db}`);

  // ── 2. GET LATEST SYNC ID ───────────────────────────────────
  const LatestSync = mongoose.models['CiqLatestSync'] ||
    mongoose.model('CiqLatestSync', new mongoose.Schema({
      _id: String, syncId: String, syncedAt: Date, totalRows: Number,
    }, { collection: 'ciq_sync_pointer' }));

  const pointer = await LatestSync.findById('latest').lean();
  if (!pointer) {
    console.error('✗ No sync pointer found. Run: npm run sync first.');
    process.exit(1);
  }
  console.log(`✓ Latest sync:  syncId=${pointer.syncId}  totalRows=${pointer.totalRows?.toLocaleString()}\n`);

  // ── 3. PULL SMALL SAMPLE ────────────────────────────────────
  const RawClaim = mongoose.models['CiqRawClaim'] ||
    mongoose.model('CiqRawClaim', new mongoose.Schema({
      syncId: String, rowIndex: Number, data: mongoose.Schema.Types.Mixed,
    }, { collection: 'ciq_raw_claims' }));

  const query = CLIENT_FILTER
    ? { syncId: pointer.syncId, 'data.Entity': new RegExp(CLIENT_FILTER, 'i') }
    : { syncId: pointer.syncId };

  console.log(`Pulling ${SAMPLE_SIZE} sample rows${CLIENT_FILTER ? ` (filter: "${CLIENT_FILTER}")` : ''}...`);
  const t0 = Date.now();
  const docs = await RawClaim.find(query, { data: 1, _id: 0 }).limit(SAMPLE_SIZE).lean();
  const rows = docs.map(d => d.data);
  console.log(`✓ Fetched ${rows.length} rows in ${Date.now() - t0}ms\n`);

  if (rows.length === 0) {
    console.error('✗ No rows returned. Check CLIENT filter or syncId.');
    process.exit(1);
  }

  // ── 4. RAW ROW INSPECTION ───────────────────────────────────
  console.log(`${'─'.repeat(60)}`);
  console.log('  RAW ROW INSPECTION (first row as stored in MongoDB)');
  console.log(`${'─'.repeat(60)}`);
  const rawFirst = rows[0];
  console.log('\nAll column names in raw row:');
  console.log(Object.keys(rawFirst).join(', '));
  console.log('\nKey field values:');
  const keyFields = [
    'Entity','Client_Name','Client_Name_Updated_','entity',
    'Year','Policy_Year','policy_year',
    'Paid_Claim','APPROVEDAMOUNT','Covered_Amount','Billed_Amount',
    'paid_claim','approvedamount','covered_amount','billed_amount',
    'Masked_Member_ID','Member_ID','Employee_ID','masked_member_id',
    'Month','Month_Name','Month_Year','month_year',
    'Type_of_Facility','facility_type','Claim_Type','claim_type',
  ];
  keyFields.forEach(f => {
    if (rawFirst[f] !== undefined) {
      console.log(`  ${f.padEnd(35)} = ${JSON.stringify(rawFirst[f])}`);
    }
  });

  // ── 5. NORMALIZER TEST ──────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  NORMALIZER TEST (what KEY_MAP produces from raw keys)');
  console.log(`${'─'.repeat(60)}`);

  const { normalizeRow } = require('./claimsCalculator');
  const normFirst = normalizeRow(rawFirst);

  console.log('\nAfter normalizeRow -- canonical keys present:');
  console.log(Object.keys(normFirst).join(', '));

  const criticalFields = {
    'entity':           'Client grouping key  ← REQUIRED for any output',
    'approved_amount':  'Primary paid amount  ← drives pmpy/pmpm/trendPct',
    'covered_amount':   'Fallback amount      ← used if approved_amount missing',
    'billed_amount':    'Billed amount        ← used if both above missing',
    'policy_year':      'Year column          ← drives trendPct calculation',
    'member_id':        'Member dedup key     ← drives headcount',
    'month_year':       'Month grouping       ← drives numMonths',
    'month_name':       'Month label          ← used in charts',
    'month':            'Month number         ← fallback for month_year',
    'claim_type':       'Claim type           ← IP/ER detection',
    'facility_type':    'Facility type        ← IP/ER detection',
    'illness_group':    'Illness group        ← chronic rate',
    'illness':          'Illness name         ← diagnosis charts',
  };

  console.log('\nCritical field status:');
  let missingCritical = false;
  Object.entries(criticalFields).forEach(([field, desc]) => {
    const val = normFirst[field];
    const present = val !== undefined && val !== null && val !== '';
    const tag = present ? '✓' : '✗ MISSING';
    if (!present) missingCritical = true;
    console.log(`  ${tag.padEnd(10)} ${field.padEnd(20)} ${present ? JSON.stringify(val) : ''}`);
    if (!present) console.log(`              └─ ${desc}`);
  });

  // ── 6. AMOUNT SAMPLE ────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  AMOUNT FIELD SAMPLING (first 10 rows)');
  console.log(`${'─'.repeat(60)}`);
  console.log(`${'row'.padEnd(5)} ${'approved_amt'.padEnd(16)} ${'covered_amt'.padEnd(14)} ${'billed_amt'.padEnd(14)} ${'entity'.padEnd(25)} ${'policy_year'}`);
  console.log('─'.repeat(90));
  rows.slice(0, 10).forEach((r, i) => {
    const norm = normalizeRow(r);
    const a = norm.approved_amount ?? 'NULL';
    const c = norm.covered_amount  ?? 'NULL';
    const b = norm.billed_amount   ?? 'NULL';
    const e = String(norm.entity   || '?').slice(0, 24);
    const y = norm.policy_year     ?? 'NULL';
    console.log(`${String(i+1).padEnd(5)} ${String(a).padEnd(16)} ${String(c).padEnd(14)} ${String(b).padEnd(14)} ${e.padEnd(25)} ${y}`);
  });

  // ── 7. ENTITY DISTRIBUTION ──────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  ENTITY DISTRIBUTION (from sample)');
  console.log(`${'─'.repeat(60)}`);
  const entityCounts = {};
  let unknownCount = 0;
  rows.forEach(r => {
    const norm = normalizeRow(r);
    const e = String(norm.entity || norm.entity_name || norm.client_name || '').trim();
    if (!e || e === 'null' || e === 'Unknown') { unknownCount++; return; }
    entityCounts[e] = (entityCounts[e] || 0) + 1;
  });
  const topEntities = Object.entries(entityCounts).sort((a,b) => b[1]-a[1]).slice(0, 10);
  if (topEntities.length === 0) {
    console.log('\n✗ NO ENTITIES FOUND in sample! Entity column not mapping correctly.');
    console.log(`  Unknown/null rows: ${unknownCount}`);
    console.log('  Check: Entity, Client_Name_Updated_, Client_Name columns in raw data above.');
  } else {
    console.log(`\n  Found ${Object.keys(entityCounts).length} entities, ${unknownCount} unknown rows`);
    console.log(`  Top entities:`);
    topEntities.forEach(([name, count]) => {
      console.log(`    ${name.slice(0,40).padEnd(42)} ${count} rows`);
    });
  }

  // ── 8. POLICY YEAR DISTRIBUTION ─────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  POLICY YEAR DISTRIBUTION');
  console.log(`${'─'.repeat(60)}`);
  const yearCounts = {};
  let noYearCount = 0;
  rows.forEach(r => {
    const norm = normalizeRow(r);
    const yr = norm.policy_year ?? norm.month_year;
    if (!yr) { noYearCount++; return; }
    const y = String(yr).slice(0, 7);
    yearCounts[y] = (yearCounts[y] || 0) + 1;
  });
  if (Object.keys(yearCounts).length === 0) {
    console.log(`\n✗ NO POLICY YEARS FOUND -- trendPct will always be 0`);
    console.log(`  No-year rows: ${noYearCount}/${rows.length}`);
    console.log('  Check: Year, Policy_Year, Month_Year columns in raw data above.');
  } else {
    console.log(`\n  Year buckets (NOTE: "2024" vs "2024-01" are DIFFERENT keys -- trendPct bug):`);
    Object.entries(yearCounts).sort().forEach(([yr, cnt]) => {
      const warn = yr.length !== 4 ? ' ← ⚠ not 4-char -- causes bucket mismatch' : '';
      console.log(`    ${yr.padEnd(12)} ${cnt} rows${warn}`);
    });
    if (noYearCount > 0) console.log(`    (${noYearCount} rows had no year)`);
  }

  // ── 9. RUN ACTUAL AGGREGATION ON SAMPLE ─────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  AGGREGATION RESULTS (from sample -- indicative only)');
  console.log(`${'─'.repeat(60)}`);
  const { aggregateClaimsToClients } = require('./claimsCalculator');
  const t1 = Date.now();
  const clients = aggregateClaimsToClients(rows);
  console.log(`\n✓ Aggregated in ${Date.now() - t1}ms  |  ${clients.length} clients found\n`);

  if (clients.length === 0) {
    console.error('✗ 0 clients produced -- entity mapping or amount mapping is broken.');
  } else {
    console.log(`  ${'Client'.padEnd(35)} ${'Members'.padEnd(10)} ${'PMPY'.padEnd(12)} ${'PMPM'.padEnd(10)} ${'TrendPct'.padEnd(12)} ${'Status'}`);
    console.log('  ' + '─'.repeat(90));
    clients.slice(0, 15).forEach(c => {
      const pmpy    = c.pmpy    ? `₱${c.pmpy.toLocaleString()}`    : '0 ← ✗';
      const pmpm    = c.pmpm    ? `₱${c.pmpm.toLocaleString()}`    : '0 ← ✗';
      const trend   = c.trendPct !== 0 ? `${c.trendPct}%` : '0% ← ✗';
      const status  = c.clientStatus || c.compositeScore || '?';
      console.log(`  ${c.name.slice(0,34).padEnd(35)} ${String(c.members).padEnd(10)} ${pmpy.padEnd(12)} ${pmpm.padEnd(10)} ${trend.padEnd(12)} ${status}`);
    });

    // Detail drill for first client
    const first = clients[0];
    console.log(`\n  Detail for "${first.name}":`);
    console.log(`    totalCost     = ₱${first.totalCost?.toLocaleString()}`);
    console.log(`    totalClaims   = ${first.totalClaims}`);
    console.log(`    members       = ${first.members}`);
    console.log(`    numMonths     = ${first.analytics?.numMonths}`);
    console.log(`    pmpm          = ₱${first.pmpm?.toLocaleString()}`);
    console.log(`    pmpy          = ₱${first.pmpy?.toLocaleString()}`);
    console.log(`    trendPct      = ${first.trendPct}%`);
    console.log(`    chronicPct    = ${first.chronicPct}%`);
    console.log(`    compositeScore= ${first.compositeScore}`);
    console.log(`    clientStatus  = ${first.clientStatus}`);
    console.log(`    policyYears   = ${JSON.stringify(first.analytics?.costByPolicyYear)}`);
    if (first.trendPct === 0) {
      console.log(`\n  ⚠ trendPct=0 reasons:`);
      const by = first.analytics?.costByPolicyYear || {};
      const yrs = Object.keys(by);
      if (yrs.length < 2) {
        console.log(`    Only ${yrs.length} year bucket(s) found: [${yrs.join(', ')}]`);
        console.log(`    Need 2+ distinct years. Check policy_year/Year column mapping.`);
      } else {
        console.log(`    Years found: ${yrs.join(', ')} -- check bucket key format (should be 4-char)`);
      }
    }
    if (first.pmpy === 0) {
      console.log(`\n  ⚠ pmpy=0 reasons:`);
      console.log(`    totalCost=${first.totalCost}, members=${first.members}, numMonths=${first.analytics?.numMonths}`);
      console.log(`    approved_amount sample: ${rows.slice(0,3).map(r => normalizeRow(r).approved_amount).join(', ')}`);
    }
  }

  // ── 10. PMPY / PMPM DEEP DEBUGGER ──────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  PMPY / PMPM DEEP DEBUGGER');
  console.log(`${'─'.repeat(60)}`);

  const { normalizeRow: nr2 } = require('./claimsCalculator');

  // rebuild entity map from sample rows
  const entityMap = {};
  rows.forEach(r => {
    const norm = nr2(r);
    const e = String(norm.entity || norm.entity_name || norm.client_name || '').trim();
    if (!e || e === 'null' || e === 'Unknown') return;
    if (!entityMap[e]) entityMap[e] = [];
    entityMap[e].push(norm);
  });

  const drillClients = Object.entries(entityMap).slice(0, 3);

  if (drillClients.length === 0) {
    console.log('\n  No clients to drill into -- entity mapping broken\n');
  }

  const MONTH_NUM2 = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
  function xYear(val) {
    if (!val) return null;
    const m = String(val).match(/\b(20\d{2}|19\d{2})\b/);
    return m ? m[1] : null;
  }
  function mKey2(r) {
    const name = String(r.month_name || '').toLowerCase().slice(0,3);
    const yr   = xYear(r.month_year) || xYear(r.policy_year) || '2022';
    const mn   = MONTH_NUM2[name] || String(r.month || '01').padStart(2,'0');
    return `${yr}-${mn}`;
  }
  function parseNum(val) {
    if (val === null || val === undefined) return null;
    const n = Number(String(val).replace(/[₱$,%\s]/g,'').replace(/,/g,''));
    return isNaN(n) ? null : n;
  }
  function safeAmt(r) {
    const a = parseNum(r.approved_amount);
    if (a !== null && a > 0) return { val: a, src: 'approved_amount' };
    const c = parseNum(r.covered_amount);
    if (c !== null && c > 0) return { val: c, src: 'covered_amount' };
    const b = parseNum(r.billed_amount);
    if (b !== null && b > 0) return { val: b, src: 'billed_amount' };
    return { val: 0, src: 'none' };
  }

  for (const [clientName, cRows] of drillClients) {
    console.log(`\n  CLIENT: "${clientName}"  (${cRows.length} rows in sample)`);
    console.log(`  ${'═'.repeat(56)}`);

    // STEP 1 - amounts
    let totalApproved = 0;
    let cntNull = 0, cntZero = 0, cntPos = 0;
    const srcCounts = {};
    const amtSamples = [];
    cRows.forEach(r => {
      const { val, src } = safeAmt(r);
      totalApproved += val;
      srcCounts[src] = (srcCounts[src] || 0) + 1;
      if (r.approved_amount === null || r.approved_amount === undefined) cntNull++;
      else if (val === 0) cntZero++;
      else cntPos++;
      if (amtSamples.length < 6) amtSamples.push({
        raw_approved: r.approved_amount,
        raw_covered:  r.covered_amount,
        raw_billed:   r.billed_amount,
        used_val:     val,
        source:       src,
      });
    });

    console.log(`\n  [STEP 1] totalApproved`);
    console.log(`           totalApproved = ${totalApproved.toLocaleString()}  ${totalApproved === 0 ? '<-- PROBLEM' : 'OK'}`);
    console.log(`           rows positive = ${cntPos} | zero = ${cntZero} | null = ${cntNull}`);
    console.log(`           source used   : ${JSON.stringify(srcCounts)}`);
    console.log(`\n           Row samples:`);
    console.log(`           ${'approved_amount'.padEnd(18)} ${'covered_amount'.padEnd(18)} ${'billed_amount'.padEnd(16)} ${'used'.padEnd(12)} source`);
    console.log(`           ${'─'.repeat(76)}`);
    amtSamples.forEach(s => {
      const a = String(s.raw_approved ?? 'NULL').slice(0,17).padEnd(18);
      const c = String(s.raw_covered  ?? 'NULL').slice(0,17).padEnd(18);
      const b = String(s.raw_billed   ?? 'NULL').slice(0,15).padEnd(16);
      const u = String(s.used_val).padEnd(12);
      console.log(`           ${a} ${c} ${b} ${u} ${s.source}`);
    });

    // STEP 2 - members
    const mIdSet = new Set(cRows.map(r => String(r.member_id || '').trim()).filter(Boolean));
    const members = mIdSet.size || Math.ceil(cRows.length / 4.2) || 1;
    console.log(`\n  [STEP 2] members`);
    console.log(`           unique member_id count = ${mIdSet.size}  ${mIdSet.size === 0 ? '<-- member_id not mapping' : 'OK'}`);
    console.log(`           members used           = ${members}  ${mIdSet.size === 0 ? '(fallback estimate)' : ''}`);
    console.log(`           sample member_ids      : ${[...mIdSet].slice(0,4).join(', ') || 'NONE'}`);

    // STEP 3 - numMonths
    const mkSet = new Set(cRows.map(r => mKey2(r)).filter(k => k && k !== '-'));
    const numMonths = Math.max(mkSet.size, 1);
    console.log(`\n  [STEP 3] numMonths`);
    console.log(`           distinct month keys = ${mkSet.size}  ${mkSet.size === 0 ? '<-- month columns not mapping' : 'OK'}`);
    console.log(`           numMonths used      = ${numMonths}`);
    console.log(`           keys                : ${[...mkSet].sort().slice(0,12).join(', ')}`);
    console.log(`           sample month_year   : ${cRows.slice(0,3).map(r => r.month_year ?? 'NULL').join(' | ')}`);
    console.log(`           sample month_name   : ${cRows.slice(0,3).map(r => r.month_name ?? 'NULL').join(' | ')}`);
    console.log(`           sample month        : ${cRows.slice(0,3).map(r => r.month      ?? 'NULL').join(' | ')}`);
    console.log(`           sample policy_year  : ${cRows.slice(0,3).map(r => r.policy_year ?? 'NULL').join(' | ')}`);

    // STEP 4 - PMPM / PMPY
    const pmpm = totalApproved > 0 ? Math.round(totalApproved / members / numMonths) : 0;
    const pmpy = pmpm * 12;
    console.log(`\n  [STEP 4] PMPM / PMPY`);
    console.log(`           Formula: PMPM = totalApproved / members / numMonths`);
    console.log(`                    PMPY = PMPM x 12`);
    console.log(`           ─────────────────────────────────────`);
    console.log(`           ${totalApproved.toLocaleString().padStart(15)}  (totalApproved)`);
    console.log(`           ${('/ ' + members).padStart(15)}  (members)`);
    console.log(`           ${('/ ' + numMonths).padStart(15)}  (numMonths)`);
    console.log(`           ${'─'.repeat(15)}`);
    console.log(`           ${('= ' + pmpm.toLocaleString()).padStart(15)}  PMPM  ${pmpm === 0 ? '<-- WRONG' : 'OK'}`);
    console.log(`           ${('x12 = ' + pmpy.toLocaleString()).padStart(15)}  PMPY  ${pmpy === 0 ? '<-- WRONG' : 'OK'}`);

    // STEP 5 - trendPct
    const byPY = {};
    cRows.forEach(r => {
      const yr = xYear(r.policy_year) || xYear(r.month_year);
      if (!yr) return;
      const { val } = safeAmt(r);
      byPY[yr] = (byPY[yr] || 0) + val;
    });
    const pYrs = Object.keys(byPY).sort();
    const prevAmt = pYrs.length >= 2 ? byPY[pYrs[pYrs.length - 2]] : null;
    const currAmt = pYrs.length >= 2 ? byPY[pYrs[pYrs.length - 1]] : null;
    const tPct   = (prevAmt && prevAmt > 0) ? parseFloat(((currAmt - prevAmt) / prevAmt * 100).toFixed(1)) : 0;

    console.log(`\n  [STEP 5] trendPct`);
    if (pYrs.length === 0) {
      console.log(`           No year buckets -- policy_year not mapping`);
      console.log(`           sample policy_year: ${cRows.slice(0,3).map(r => r.policy_year ?? 'NULL').join(' | ')}`);
    } else {
      Object.entries(byPY).sort().forEach(([yr, total]) => {
        console.log(`           ${yr}  ->  total = ${total.toLocaleString()}`);
      });
    }
    console.log(`           prev = ${prevAmt != null ? prevAmt.toLocaleString() : 'N/A'}`);
    console.log(`           curr = ${currAmt != null ? currAmt.toLocaleString() : 'N/A'}`);
    console.log(`           trendPct = ${tPct}%  ${tPct === 0 && pYrs.length < 2 ? '<-- need 2+ years' : tPct === 0 ? '(flat -- same year amounts)' : 'OK'}`);

    console.log(`\n  ${'═'.repeat(56)}`);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log('  DONE');
  console.log(`${'─'.repeat(60)}\n`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
