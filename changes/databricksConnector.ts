// @ts-nocheck
/**
 * databricksConnector.ts -- Databricks SQL Connector
 * ---------------------------------------------------
 * Connects to Databricks, introspects columns dynamically,
 * fetches claim-level data, aggregates via claimsCalculator.
 * Zero hardcoded column names -- schema-adaptive.
 *
 * Fix v3.1: All selected columns are backtick-quoted individually
 * to prevent Databricks parsing "Plan_Description" as STRUCT access.
 */

const { aggregateClaimsToClients, isClaimsLevelData, normalizeRow } = require('./claimsCalculator');

const DB_CONFIG = {
  token:   process.env.DATABRICKS_TOKEN          || '',
  host:    process.env.DATABRICKS_SERVER_HOSTNAME || '',
  path:    process.env.DATABRICKS_HTTP_PATH       || '',
  table:   process.env.DATABRICKS_TABLE           || null,
  years:   process.env.DATABRICKS_POLICY_YEARS    || null,
  maxRows: parseInt(process.env.DATABRICKS_MAX_ROWS || '500000'),
};

// All known column name variants across old and new schemas
const KNOWN_COLUMN_VARIANTS = {
  policy_year:      ['Policy_Year','PolicyYear','policy_year','POLICY_YEAR','Year','year','YEAR'],
  month:            ['Month','month','MONTH'],
  month_name:       ['Month_Name','MonthName','month_name','MONTH_NAME'],
  month_year:       ['Month_Year','MonthYear','month_year','MONTH_YEAR'],
  quarter:          ['New_Quarter','NewQuarter','new_quarter','Quarter','quarter','QUARTER'],
  fund:             ['Fund','fund','FUND','Insurer','insurer'],
  claim_type:       ['Final_Claim_Type','FinalClaimType','final_claim_type','Claim_Type','ClaimType','claim_type','Claim_Type__group_','Claim_Definition'],
  member_type:      ['Member_Type','MemberType','member_type','Provider_Category'],
  relationship:     ['Relationship','relationship','Relationship__group_'],
  icd_code:         ['ICD_Code2','ICDCode2','icd_code2','ICD_Code','icd_code','Icd_9'],
  illness:          ['Illness','illness','Diagnosis_Major'],
  illness_group:    ['Illness_Group','IllnessGroup','illness_group','Grouped_Diagnosis_Updated_','Grouped_Diagnosis_Updated','Grouped_Diagnosis'],
  facility:         ['Facility','facility','Provider_Name','Providers__Hospitals_'],
  facility_type:    ['Type_of_Facility','TypeOfFacility','type_of_facility','Facility_Type','facility_type','Provider_Type'],
  case_count:       ['Case_Count','CaseCount','case_count'],
  claim_no:         ['Claim_No','ClaimNo','claim_no','Claim_ID','claim_id'],
  plan_level:       ['Plan_Level','PlanLevel','plan_level'],
  plan_description: ['Plan_Description','PlanDescription','plan_description'],
  age:              ['Age','age','AGE'],
  age_group:        ['Age_Group','AgeGroup','age_group','Age_Band','AgeBand','Age_Band__group_'],
  year_of_birth:    ['Year_of_Birth','YearOfBirth','year_of_birth'],
  gender:           ['Gender','gender','GENDER','Gender__group_'],
  civil_status:     ['Civil_Status','CivilStatus','civil_status','Fili_Status'],
  billed_amount:    ['Billed_Amount','BilledAmount','billed_amount','Submitted_Claim_Amount'],
  covered_amount:   ['Covered_Amount','CoveredAmount','covered_amount'],
  approved_amount:  ['APPROVEDAMOUNT','Approved_Amount','ApprovedAmount','approved_amount','Paid_Claim'],
  member_id:        ['Masked_Member_ID','MaskedMemberID','masked_member_id','Masked_Employee_ID','MaskedEmployeeID','Member_ID','Employee_ID'],
  entity:           ['Entity','entity','ENTITY','Company','company','Organization','Client_Name_Updated_','Client_Name','Client_ID'],
  branch:           ['Branch','branch','Provider_Location'],
  category:         ['Category','category','Industry1','Industry__group_','Industry','industry'],
  status:           ['Status','status','Claim_status','ClaimStatus'],
  mbl:              ['MBL','mbl','Max_Benefit_Limit'],
};

let DBSQLClient = null;
function getDBClient() {
  if (!DBSQLClient) {
    try {
      DBSQLClient = require('@databricks/sql').DBSQLClient;
    } catch (e) {
      throw new Error('@databricks/sql not installed. Run: npm install @databricks/sql');
    }
  }
  return new DBSQLClient();
}

function isDatabricksConfigured() {
  return !!(DB_CONFIG.token && DB_CONFIG.host && DB_CONFIG.path);
}

// ── SAFE COLUMN LIST ─────────────────────────────────────────────
// Each matched column is wrapped in backticks individually.
// This prevents Databricks from interpreting "Plan_Description"
// as a STRUCT field access (Plan.Description) which causes:
// [INVALID_EXTRACT_BASE_FIELD_TYPE] Can't extract a value from "Plan"
function buildSafeColumnList(actualColumns) {
  const actualMap = {};
  actualColumns.forEach(c => {
    const key = c.toLowerCase().replace(/[\s._()-]/g, '');
    actualMap[key] = c;
  });

  const selected = [], resolvedCols = {};
  for (const [role, variants] of Object.entries(KNOWN_COLUMN_VARIANTS)) {
    let found = null;
    for (const v of variants) {
      const key = v.toLowerCase().replace(/[\s._()-]/g, '');
      if (actualMap[key]) { found = actualMap[key]; break; }
    }
    if (found) {
      // ✅ Backtick-wrap each column name individually
      selected.push(`\`${found}\``);
      resolvedCols[role] = found; // store raw name (no backticks) for WHERE clause
    }
  }

  if (selected.length === 0) {
    console.warn('[databricks] ⚠  No known columns matched -- using SELECT *');
    return { columnList: '*', resolvedCols };
  }

  console.log(`[databricks] ✓ Matched ${selected.length}/${Object.keys(KNOWN_COLUMN_VARIANTS).length} columns`);
  return { columnList: selected.join(', '), resolvedCols };
}

// ── QUERY BUILDER ────────────────────────────────────────────────
function buildClaimsQuery(tableName, options = {}) {
  const { years, limit, columnList = '*', resolvedCols = {} } = options;
  let sql = `SELECT ${columnList} FROM ${tableName}`;

  if (years && years.length > 0) {
    // resolvedCols stores raw column name -- wrap in backticks for WHERE too
    const yearCol = resolvedCols['policy_year'];
    if (yearCol) {
      sql += ` WHERE \`${yearCol}\` IN (${years.map(y => `'${y}'`).join(', ')})`;
    }
  }

  if (limit) sql += ` LIMIT ${limit}`;
  return sql;
}

// ── TABLE INTROSPECTION ───────────────────────────────────────────
async function getTableColumns(session, tableName) {
  // Try DESCRIBE first
  try {
    const op = await session.executeStatement(
      `DESCRIBE TABLE ${tableName}`, { runAsync: true, maxRows: 200 }
    );
    const rows = await op.fetchAll();
    await op.close();
    const cols = rows
      .map(r => r.col_name || r.column_name || r.name || '')
      .filter(c => c && !c.startsWith('#'));
    if (cols.length > 0) {
      console.log(`[databricks] ✓ DESCRIBE returned ${cols.length} columns`);
      return cols;
    }
  } catch (e) { console.warn('[databricks] DESCRIBE failed:', e.message); }

  // Fallback: SELECT * LIMIT 1 to read column names from result
  try {
    const op = await session.executeStatement(
      `SELECT * FROM ${tableName} LIMIT 1`, { runAsync: true, maxRows: 1 }
    );
    const rows = await op.fetchAll();
    await op.close();
    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      console.log(`[databricks] ✓ LIMIT 1 fallback returned ${cols.length} columns`);
      return cols;
    }
  } catch (e) { console.warn('[databricks] LIMIT 1 fallback failed:', e.message); }

  return [];
}

async function discoverClaimsTable(session) {
  try {
    const op = await session.executeStatement('SHOW TABLES', { runAsync: true, maxRows: 100 });
    const tables = await op.fetchAll();
    await op.close();
    const names = tables.map(t =>
      `${t.catalog||t.database||''}.${t.namespace||t.schema||''}.${t.tableName||t.name||''}`
        .replace(/^\.+|\.+$/g, '')
    );
    return names.find(t => /claims|insurance|hmo|indicators/i.test(t)) || names[0] || null;
  } catch (e) { return null; }
}

// ── FETCH RAW ROWS (used by sync.ts -- no aggregation here) ──────
async function fetchClaimsFromDatabricks() {
  if (!isDatabricksConfigured()) {
    throw new Error(
      'Databricks not configured. Set DATABRICKS_TOKEN, DATABRICKS_SERVER_HOSTNAME, DATABRICKS_HTTP_PATH in .env'
    );
  }

  console.log('[databricks] Connecting to:', DB_CONFIG.host);
  const client = getDBClient();
  await client.connect({ token: DB_CONFIG.token, host: DB_CONFIG.host, path: DB_CONFIG.path });
  const session = await client.openSession();
  console.log('[databricks] ✓ Session opened');

  try {
    let tableName = DB_CONFIG.table;
    if (!tableName) {
      tableName = await discoverClaimsTable(session);
      if (!tableName) throw new Error('No table found. Set DATABRICKS_TABLE in .env');
    }

    const years         = DB_CONFIG.years ? DB_CONFIG.years.split(',').map(y => y.trim()) : null;
    const actualColumns = await getTableColumns(session, tableName);
    const { columnList, resolvedCols } = buildSafeColumnList(actualColumns);

    const sql = buildClaimsQuery(tableName, {
      years, limit: DB_CONFIG.maxRows, columnList, resolvedCols,
    });

    console.log(`[databricks] Querying: ${tableName}`);
    console.log('[databricks] SQL:', sql.slice(0, 300));

    const op   = await session.executeStatement(sql, { runAsync: true, maxRows: DB_CONFIG.maxRows });
    const rows = await op.fetchAll();
    await op.close();

    console.log(`[databricks] ✓ Fetched ${rows.length.toLocaleString()} rows`);
    return rows;

  } finally {
    await session.close();
    await client.close();
    console.log('[databricks] Connection closed');
  }
}

// ── LOAD + AGGREGATE (legacy -- kept for backward compat) ─────────
// Note: in the new sync flow, aggregation happens in server.ts after
// reading from MongoDB. This function is no longer called on boot.
async function loadDatabricksData() {
  const t0      = Date.now();
  const rawRows = await fetchClaimsFromDatabricks();
  if (!rawRows || rawRows.length === 0) throw new Error('Databricks returned 0 rows.');

  console.log(`[databricks] Aggregating ${rawRows.length.toLocaleString()} claims...`);
  const clients   = aggregateClaimsToClients(rawRows);
  const elapsed   = ((Date.now() - t0) / 1000).toFixed(1);
  const policyYears = [...new Set(clients.map(c => c.analytics?.latestPolicyYear).filter(Boolean))];
  console.log(`[databricks] ✓ ${clients.length} clients in ${elapsed}s`);

  return {
    clients, stories: [], narratives: {}, claimsData: rawRows, sheets: {},
    meta: {
      source: 'databricks', host: DB_CONFIG.host,
      table: DB_CONFIG.table || 'auto-discovered',
      parsedAt: new Date().toISOString(), totalClients: clients.length,
      totalClaims: rawRows.length, dataFormat: 'hmo-claims-level',
      currency: '₱', loadTimeSeconds: parseFloat(elapsed), policyYears,
      sheetNames: [], primaryKey: '', filePath: '',
    },
  };
}

// ── TEST CONNECTION ───────────────────────────────────────────────
async function testDatabricksConnection() {
  if (!isDatabricksConfigured()) {
    return { success: false, message: 'Databricks credentials not set in .env', configured: false };
  }
  try {
    const client = getDBClient();
    await client.connect({ token: DB_CONFIG.token, host: DB_CONFIG.host, path: DB_CONFIG.path });
    const session = await client.openSession();
    let rowCount = null;
    if (DB_CONFIG.table) {
      try {
        const op = await session.executeStatement(
          `SELECT COUNT(*) as cnt FROM ${DB_CONFIG.table}`, { runAsync: true, maxRows: 1 }
        );
        const res = await op.fetchAll(); await op.close();
        rowCount = res[0]?.cnt || null;
      } catch (e) {}
    }
    await session.close(); await client.close();
    return {
      success: true, configured: true,
      message: 'Databricks connection successful',
      host: DB_CONFIG.host, table: DB_CONFIG.table || 'not set', rowCount,
    };
  } catch (e) {
    return {
      success: false, configured: true, message: e.message,
      hint: e.message.includes('@databricks/sql')
        ? 'Run: npm install @databricks/sql' : 'Check credentials in .env',
    };
  }
}

module.exports = {
  isDatabricksConfigured, fetchClaimsFromDatabricks,
  loadDatabricksData, testDatabricksConnection, DB_CONFIG,
};
