// @ts-nocheck
/**
 * databricksConnector.ts -- Databricks SQL Connector  v3.2
 * ----------------------------------------------------------
 * Schema-adaptive connector. Zero hardcoded column names.
 *
 * Changes v3.2:
 *   - Added all columns visible in the actual Databricks table (Image 1)
 *   - Backtick-quotes every selected column individually (fixes STRUCT error)
 *   - Added: country, source_system_code, admission_date, discharge_date,
 *     claim_payment_date, file_date, room_type, reject_category,
 *     rejection_reasons, policy_number, entity_code, client_demo,
 *     member_reference_date, members_effective_date,
 *     members_original_effective_date, relationship_1, claim_type_1,
 *     claim_type_level2, maskedmemberid_icd, case_tag, industry_group
 *   - "Plan" column now explicitly mapped to plan_level (was root cause of
 *     [INVALID_EXTRACT_BASE_FIELD_TYPE] STRUCT error)
 *   - "Paid_Claim" / "Paid_Claim_DOUBLE" both mapped to approved_amount
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

// ── KNOWN COLUMN VARIANTS ────────────────────────────────────────
// Every variant that has ever appeared across schemas.
// Ordered: most-likely-to-match first for speed.
// Key = internal role name, Value = array of raw column name variants.
const KNOWN_COLUMN_VARIANTS = {

  // ── TIME ──────────────────────────────────────────────────────
  policy_year: [
    'Policy_Year','PolicyYear','policy_year','POLICY_YEAR','Year','year','YEAR',
  ],
  month: [
    'Month','month','MONTH',
  ],
  month_name: [
    'Month_Name','MonthName','month_name','MONTH_NAME',
  ],
  month_year: [
    'Month_Year','MonthYear','month_year','MONTH_YEAR',
  ],
  quarter: [
    'New_Quarter','NewQuarter','new_quarter','Quarter','quarter','QUARTER',
  ],

  // ── CLAIM IDENTIFIERS ─────────────────────────────────────────
  claim_no: [
    'Claim_No','ClaimNo','claim_no','Claim_ID','claim_id','Claim_ID',
  ],
  claim_type: [
    'Final_Claim_Type','FinalClaimType','final_claim_type',
    'Claim_Type','ClaimType','claim_type',
    'Claim_Type__group_','Claim_Type_group','Claim_Type_1',
    'Claim_Definition',
  ],
  claim_type_level2: [
    'Claim_Type_Level_2','ClaimTypeLevel2','claim_type_level_2',
  ],
  status: [
    'Claim_status','ClaimStatus','claim_status','Status','status','STATUS',
    'Claim_Status_1',
  ],
  reject_category: [
    'Reject_claim_category','RejectClaimCategory','reject_claim_category',
  ],
  rejection_reasons: [
    'Rejection_Reasons','RejectionReasons','rejection_reasons',
  ],
  case_count: [
    'Case_Count','CaseCount','case_count',
  ],
  case_tag: [
    'Case_Tag','CaseTag','case_tag',
  ],
  room_type: [
    'Room_Type','RoomType','room_type',
  ],
  policy_number: [
    'Policy_Number','PolicyNumber','policy_number',
  ],
  fund: [
    'Fund','fund','FUND','Insurer','insurer',
  ],

  // ── DATES ─────────────────────────────────────────────────────
  admission_date: [
    'Admission_Date','AdmissionDate','admission_date',
  ],
  discharge_date: [
    'Discharge_Date','DischargeDate','discharge_date','Discharhge_Date',
  ],
  claim_payment_date: [
    'Claim_Payment_Date','ClaimPaymentDate','claim_payment_date',
  ],
  file_date: [
    'File_Date','FileDate','file_date',
  ],
  members_effective_date: [
    'Members_Effective_Date','MembersEffectiveDate','members_effective_date',
  ],
  members_original_effective_date: [
    'Members_Original_Effective_Date','MembersOriginalEffectiveDate',
    'members_original_effective_date',
  ],
  member_reference_date: [
    'Member_Reference_Date','MemberReferenceDate','member_reference_date',
  ],

  // ── MEMBER / DEMOGRAPHICS ─────────────────────────────────────
  member_id: [
    'Masked_Member_ID','MaskedMemberID','masked_member_id',
    'Masked_Employee_ID','MaskedEmployeeID','masked_employee_id',
    'Employee_Masked_ID','EmployeeMaskedID',
    'Member_ID','MemberID','member_id',
    'Employee_ID','EmployeeID','employee_id',
  ],
  member_icd_tag: [
    'MaskedMemberID_ICD','Masked_MemberID_ICD','maskedmemberid_icd',
  ],
  member_type: [
    'Member_Type','MemberType','member_type',
    'Provider_Category','ProviderCategory','provider_category',
  ],
  relationship: [
    'Relationship','relationship','RELATIONSHIP',
    'Relationship__group_','Relationship_group',
    'Relationship_1',
  ],
  age: [
    'Age','age','AGE',
  ],
  age_group: [
    'Age_Group','AgeGroup','age_group',
    'Age_Band','AgeBand','age_band',
    'Age_Band__group_','Age_Group_1',
  ],
  year_of_birth: [
    'Year_of_Birth','YearOfBirth','year_of_birth',
  ],
  gender: [
    'Gender','gender','GENDER',
    'Gender__group_','Gender_group',
  ],
  civil_status: [
    'Civil_Status','CivilStatus','civil_status',
    'Fili_Status','Civil_Status_1',
  ],

  // ── ENTITY / CLIENT ───────────────────────────────────────────
  entity: [
    'Entity','entity','ENTITY',
    'Client_Name_Updated_','Client_Name_Updated',
    'Client_Name','ClientName',
    'Client_ID','ClientID',
    'Entity_Name','EntityName',
    'Company','company','Organization',
  ],
  entity_code: [
    'Entity_code','EntityCode','entity_code','Entity_Code',
  ],
  client_demo: [
    'Client_Demo','ClientDemo','client_demo',
  ],
  country: [
    'country','Country','COUNTRY',
  ],
  source_system_code: [
    'source_system_code','SourceSystemCode','Source_System_Code',
  ],
  category: [
    'Category','category','CATEGORY',
    'Industry1','Industry__group_','Industry_group',
    'Industry','industry',
  ],
  branch: [
    'Branch','branch','BRANCH',
    'Provider_Location','ProviderLocation',
  ],

  // ── DIAGNOSIS / ILLNESS ───────────────────────────────────────
  icd_code: [
    'ICD_Code2','ICDCode2','icd_code2',
    'ICD_Code','icd_code','ICD_CODE',
    'Icd_9',
  ],
  illness: [
    'Illness','illness','ILLNESS',
    'Diagnosis_Major','DiagnosisMajor',
  ],
  illness_group: [
    'Illness_Group','IllnessGroup','illness_group',
    'Grouped_Diagnosis_Updated_','Grouped_Diagnosis_Updated',
    'Grouped_Diagnosis',
  ],

  // ── FACILITY ──────────────────────────────────────────────────
  facility: [
    'Facility','facility',
    'Provider_Name','ProviderName',
    'Providers__Hospitals_','Providers_Hospitals',
  ],
  facility_type: [
    'Type_of_Facility','TypeOfFacility','type_of_facility',
    'Facility_Type','FacilityType','facility_type',
    'Provider_Type','ProviderType',
  ],

  // ── PLAN ──────────────────────────────────────────────────────
  // NOTE: "Plan" MUST be listed here explicitly -- without backtick quoting
  // Databricks parses it as a STRUCT and throws INVALID_EXTRACT_BASE_FIELD_TYPE
  plan_level: [
    'Plan_Level','PlanLevel','plan_level',
    'Plan',   // ← bare "Plan" column in Databricks table -- backtick fix handles this
  ],
  plan_description: [
    'Plan_Description','PlanDescription','plan_description',
  ],
  plan_start_date: [
    'Plan_Start_Date','PlanStartDate','plan_start_date',
  ],
  plan_end_date: [
    'Plan_End_Date','PlanEndDate','plan_end_date',
  ],

  // ── AMOUNTS ───────────────────────────────────────────────────
  approved_amount: [
    'APPROVEDAMOUNT','Approved_Amount','ApprovedAmount','approved_amount',
    'Paid_Claim','PaidClaim','paid_claim',
    'Paid_Claim_DOUBLE',           // Databricks column with type suffix
  ],
  billed_amount: [
    'Billed_Amount','BilledAmount','billed_amount',
    'Submitted_Claim_Amount','SubmittedClaimAmount',
  ],
  covered_amount: [
    'Covered_Amount','CoveredAmount','covered_amount',
  ],

  // ── LIMITS ────────────────────────────────────────────────────
  mbl: [
    'MBL','mbl','Max_Benefit_Limit','MaxBenefitLimit',
  ],

  // ── META ──────────────────────────────────────────────────────
  filename: [
    'FileName','Filename','filename','FILENAME','File_Name',
  ],
};

// ── DB CLIENT ────────────────────────────────────────────────────
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
// Each matched column is backtick-wrapped individually.
// This prevents Databricks parsing "Plan_Description" as Plan.Description
// (STRUCT access) which throws [INVALID_EXTRACT_BASE_FIELD_TYPE].
function buildSafeColumnList(actualColumns) {
  const actualMap = {};
  actualColumns.forEach(c => {
    // Normalise: lowercase, strip spaces/dots/underscores/parens for fuzzy match
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
      selected.push(`\`${found}\``);   // ← backtick each column individually
      resolvedCols[role] = found;       // raw name kept for WHERE clause
    }
  }

  if (selected.length === 0) {
    console.warn('[databricks] ⚠  No known columns matched -- using SELECT *');
    return { columnList: '*', resolvedCols };
  }

  console.log(`[databricks] ✓ Matched ${selected.length}/${Object.keys(KNOWN_COLUMN_VARIANTS).length} columns`);
  // Log unmatched roles for debugging
  const matched = new Set(Object.keys(resolvedCols));
  const unmatched = Object.keys(KNOWN_COLUMN_VARIANTS).filter(r => !matched.has(r));
  if (unmatched.length) {
    console.log(`[databricks]   Unmatched roles: ${unmatched.join(', ')}`);
  }

  return { columnList: selected.join(', '), resolvedCols };
}

// ── QUERY BUILDER ────────────────────────────────────────────────
function buildClaimsQuery(tableName, options = {}) {
  const { years, limit, columnList = '*', resolvedCols = {} } = options;
  let sql = `SELECT ${columnList} FROM ${tableName}`;

  if (years && years.length > 0) {
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
  // Strategy 1: DESCRIBE TABLE
  try {
    const op = await session.executeStatement(
      `DESCRIBE TABLE ${tableName}`, { runAsync: true, maxRows: 300 }
    );
    const rows = await op.fetchAll();
    await op.close();
    const cols = rows
      .map(r => r.col_name || r.column_name || r.name || '')
      .filter(c => c && !c.startsWith('#') && !c.startsWith(' '));
    if (cols.length > 0) {
      console.log(`[databricks] ✓ DESCRIBE returned ${cols.length} columns`);
      return cols;
    }
  } catch (e) { console.warn('[databricks] DESCRIBE failed:', e.message); }

  // Strategy 2: SELECT * LIMIT 1 -- read keys from first row
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

// ── FETCH RAW ROWS ────────────────────────────────────────────────
// Called by sync.ts -- returns raw rows, NO aggregation here.
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

    if (actualColumns.length === 0) {
      throw new Error(`Could not introspect columns from ${tableName}. Check table name and permissions.`);
    }

    const { columnList, resolvedCols } = buildSafeColumnList(actualColumns);

    const sql = buildClaimsQuery(tableName, {
      years, limit: DB_CONFIG.maxRows, columnList, resolvedCols,
    });

    console.log(`[databricks] Querying: ${tableName}`);
    console.log('[databricks] SQL preview:', sql.slice(0, 400));

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
// In the new sync flow, aggregation happens in server.ts after
// reading raw rows from MongoDB. This is not called on boot.
async function loadDatabricksData() {
  const t0      = Date.now();
  const rawRows = await fetchClaimsFromDatabricks();
  if (!rawRows || rawRows.length === 0) throw new Error('Databricks returned 0 rows.');

  console.log(`[databricks] Aggregating ${rawRows.length.toLocaleString()} claims...`);
  const clients     = aggregateClaimsToClients(rawRows);
  const elapsed     = ((Date.now() - t0) / 1000).toFixed(1);
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
    let rowCount = null, columnCount = null;
    if (DB_CONFIG.table) {
      try {
        const op = await session.executeStatement(
          `SELECT COUNT(*) as cnt FROM ${DB_CONFIG.table}`, { runAsync: true, maxRows: 1 }
        );
        const res = await op.fetchAll(); await op.close();
        rowCount = res[0]?.cnt || null;
      } catch (e) {}
      try {
        const cols = await getTableColumns(session, DB_CONFIG.table);
        columnCount = cols.length;
      } catch (e) {}
    }
    await session.close(); await client.close();
    return {
      success: true, configured: true,
      message: 'Databricks connection successful',
      host: DB_CONFIG.host, table: DB_CONFIG.table || 'not set',
      rowCount, columnCount,
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
