 table:    process.env.DATABRICKS_TABLE           || null,
  // Optional: filter by policy year (e.g. "2022-23,2023-24")
  years:    process.env.DATABRICKS_POLICY_YEARS    || null,
  // Max rows to fetch per query (large datasets: use 500000+)
  maxRows:  parseInt(process.env.DATABRICKS_MAX_ROWS || "500000"),
};

// ─────────────────────────────────────────────────────────────
// DATABRICKS SQL CLIENT LOADER
// Lazy-loads @databricks/sql so the server starts even if the
// package is not yet installed (Excel-only mode still works).
// ─────────────────────────────────────────────────────────────
let DBSQLClient = null;
function getDBClient() {
  if (!DBSQLClient) {
    try {
      DBSQLClient = require("@databricks/sql").DBSQLClient;
    } catch (e) {
      throw new Error(
        "@databricks/sql not installed. Run: npm install @databricks/sql\n" +
        "Then restart the server."
      );
    }
  }
  return new DBSQLClient();
}

// ─────────────────────────────────────────────────────────────
// CONFIG CHECKER
// ─────────────────────────────────────────────────────────────
function isDatabricksConfigured() {
  return !!(DB_CONFIG.token && DB_CONFIG.host && DB_CONFIG.path);
}

function isDatabricksTableSet() {
  return !!(DB_CONFIG.table);
}

// ─────────────────────────────────────────────────────────────
// SAFE COLUMN INTROSPECTION
// Fetches actual column names from the table before querying,
// so we never reference columns that don't exist.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// KNOWN COLUMN VARIANTS
// Every canonical role the calculator needs, with ALL known raw
// name variants from both old schema and new schema (dot-notation
// columns are stored here without dots since Databricks normalises
// them to underscores in DESCRIBE TABLE output).
// ─────────────────────────────────────────────────────────────
const KNOWN_COLUMN_VARIANTS = {

  // ── TIME / POLICY ──────────────────────────────────────────
  policy_year: [
    "Policy_Year","PolicyYear","policy_year","POLICY_YEAR",
    "Year","year","YEAR",                        // new schema
    "Policy_Number","PolicyNumber","policy_number",
  ],
  month: [
    "Month","month","MONTH",
  ],
  month_name: [
    "Month_Name","MonthName","month_name","MONTH_NAME",
  ],
  month_year: [
    "Month_Year","MonthYear","month_year","MONTH_YEAR",
  ],
  quarter: [
    "New_Quarter","NewQuarter","new_quarter",
    "Quarter","quarter","QUARTER",
  ],
  admission_date: [
    "Admission_Date","AdmissionDate","admission_date","ADMISSION_DATE",
    "Admission.Date",
  ],

  // ── FUND / INSURER ─────────────────────────────────────────
  // fund = HOW the claim is financed (HMO type / carrier)
  fund: [
    "Fund","fund","FUND",
    "Insurer","insurer","INSURER",               // new schema — carrier name
  ],

  // ── CLAIM TYPE ─────────────────────────────────────────────
  claim_type: [
    "Final_Claim_Type","FinalClaimType","final_claim_type",
    "Claim_Type","ClaimType","claim_type","CLAIM_TYPE",
    // new schema dot-notation (Databricks stores as underscores)
    "Claim_Type__group_","Claim_Type_group","ClaimTypegroup",    // Claim.Type (group)
    "Claim_Type_1","ClaimType1","claim_type_1",                  // Claim.Type-1
    "Claim_Type_level_2","ClaimTypelevel2","claim_type_level_2", // Claim.Type.level.2
    "Claim_Definition","ClaimDefinition","claim_definition",
  ],

  // ── MEMBER / RELATIONSHIP ──────────────────────────────────
  member_type: [
    "Member_Type","MemberType","member_type","MEMBER_TYPE",
    "Provider_Category","ProviderCategory","provider_category",  // new schema
  ],
  relationship: [
    "Relationship","relationship","RELATIONSHIP",
    "Relationship__group_","Relationship_group","Relationshipgroup", // new schema
  ],

  // ── DIAGNOSIS / ILLNESS ────────────────────────────────────
  icd_code: [
    "ICD_Code2","ICDCode2","icd_code2",
    "ICD_Code","ICDCode","icd_code",
    "Icd_9","ICD9","icd_9","Icd9",               // new schema
  ],
  illness: [
    "Illness","illness","ILLNESS",
    "Diagnosis_Major","DiagnosisMajor","diagnosis_major",        // new schema
  ],
  illness_group: [
    "Illness_Group","IllnessGroup","illness_group","ILLNESS_GROUP",
    "Grouped_Diagnosis_Updated_","GroupedDiagnosisUpdated",      // new schema (with trailing _)
    "Grouped_Diagnosis_Updated","Grouped_DiagnosisUpdated",
    "Grouped_Diagnosis","GroupedDiagnosis","grouped_diagnosis",  // new schema
  ],

  // ── FACILITY / PROVIDER ────────────────────────────────────
  facility: [
    "Facility","facility","FACILITY",
    "Provider_Name","ProviderName","provider_name",              // new schema
    "Providers__Hospitals_","Providers_Hospitals","ProvidersHospitals", // new schema
  ],
  facility_type: [
    "Type_of_Facility","TypeOfFacility","type_of_facility",
    "Facility_Type","FacilityType","facility_type","FACILITY_TYPE",
    "Provider_Type","ProviderType","provider_type",              // new schema
  ],

  // ── CASE ───────────────────────────────────────────────────
  case_count:      ["Case_Count","CaseCount","case_count","CASE_COUNT"],
  claim_no:        ["Claim_No","ClaimNo","claim_no","CLAIM_NO","Claim_ID","ClaimID","claim_id"],

  // ── PLAN ───────────────────────────────────────────────────
  plan_level:      ["Plan_Level","PlanLevel","plan_level","PLAN_LEVEL"],
  plan_description:[
    "Plan_Description","PlanDescription","plan_description",
    "Plan_End_Date","PlanEndDate","plan_end_date",               // new schema
    "Plan_Start_Date","PlanStartDate","plan_start_date",
  ],

  // ── DEMOGRAPHICS ───────────────────────────────────────────
  age:            ["Age","age","AGE"],
  age_group: [
    "Age_Group","AgeGroup","age_group","AGE_GROUP",
    "Age_Band","AgeBand","age_band",                             // new schema
    "Age_Band__group_","AgeBandgroup","Age_Band_group",          // new schema (group)
  ],
  year_of_birth:  ["Year_of_Birth","YearOfBirth","year_of_birth","YEAR_OF_BIRTH"],
  gender: [
    "Gender","gender","GENDER",
    "Gender__group_","Gender_group","Gendergroup",               // new schema
  ],
  civil_status: [
    "Civil_Status","CivilStatus","civil_status","CIVIL_STATUS",
    "Fili_Status","FiliStatus","fili_status",                    // new schema
  ],

  // ── AMOUNTS ────────────────────────────────────────────────
  billed_amount: [
    "Billed_Amount","BilledAmount","billed_amount","BILLED_AMOUNT",
    "Submitted_Claim_Amount","SubmittedClaimAmount","submitted_claim_amount", // new schema
  ],
  covered_amount: ["Covered_Amount","CoveredAmount","covered_amount","COVERED_AMOUNT"],
  approved_amount: [
    "APPROVEDAMOUNT","Approved_Amount","ApprovedAmount","approved_amount",
    "Paid_Claim","PaidClaim","paid_claim",                       // new schema
  ],

  // ── MEMBER IDs ─────────────────────────────────────────────
  member_id: [
    "Masked_Member_ID","MaskedMemberID","masked_member_id",
    "Masked_Employee_ID","MaskedEmployeeID","masked_employee_id",
    "Member_ID","MemberID","member_id","MEMBER_ID",              // new schema
    "Employee_ID","EmployeeID","employee_id","EMPLOYEE_ID",      // new schema
  ],

  // ── ENTITY / COMPANY ───────────────────────────────────────
  entity: [
    "Entity","entity","ENTITY",
    "Company","company","Organization","organization","Account","account",
    "Client_Name_Updated_","ClientNameUpdated","Client_Name_Updated", // new schema
    "Client_Name","ClientName","client_name",                    // new schema
    "Client_ID","ClientID","client_id",                          // new schema (fallback)
  ],

  // ── LOCATION / ORG ─────────────────────────────────────────
  branch: [
    "Branch","branch","BRANCH",
    "Provider_Location","ProviderLocation","provider_location",  // new schema
  ],
  category: [
    "Category","category","CATEGORY",
    "Industry1","industry1","INDUSTRY1",                         // new schema — employer sector
    "Industry__group_","Industry_group","Industrygroup",         // new schema
    "Industry","industry","INDUSTRY",
  ],

  // ── STATUS / OTHER ─────────────────────────────────────────
  status: [
    "Status","status","STATUS",
    "Claim_status","ClaimStatus","claim_status","CLAIM_STATUS",  // new schema
  ],
  mbl:            ["MBL","mbl","Max_Benefit_Limit","MaxBenefitLimit"],
};

// ── YEAR FILTER ROLES ──────────────────────────────────────────
// Roles that represent a policy/calendar year for WHERE filtering
const YEAR_FILTER_ROLES = ["policy_year"];

/**
 * Introspects actual columns, returns:
 *   { columnList, resolvedCols }
 *
 * resolvedCols = Map of role → actual column name found in table
 * Used by buildClaimsQuery to build safe ORDER BY and WHERE clauses.
 */
function buildSafeColumnList(actualColumns) {
  // Build lookup: normalised_key → actual_column_name
  const actualMap = {};
  actualColumns.forEach(c => {
    // Strip dots, spaces, underscores for fuzzy match
    const key = c.toLowerCase().replace(/[\s._()-]/g, "");
    actualMap[key] = c;
  });

  const selected    = [];
  const resolvedCols = {};  // role → actual column name

  for (const [role, variants] of Object.entries(KNOWN_COLUMN_VARIANTS)) {
    let found = null;
    for (const variant of variants) {
      const key = variant.toLowerCase().replace(/[\s._()-]/g, "");
      if (actualMap[key]) {
        found = actualMap[key];
        break;
      }
    }
    if (found) {
      selected.push(found);
      resolvedCols[role] = found;   // remember actual name for ORDER BY / WHERE
    }
  }

  if (selected.length === 0) {
    console.warn("[databricks] ⚠️  No known columns matched — using SELECT *");
    return { columnList: "*", resolvedCols };
  }

  console.log(`[databricks] ✅ Matched ${selected.length}/${Object.keys(KNOWN_COLUMN_VARIANTS).length} known columns`);
  console.log(`[databricks] 📋 Resolved: entity="${resolvedCols.entity||"?"}", year="${resolvedCols.policy_year||"?"}", approved="${resolvedCols.approved_amount||"?"}"`);
  return { columnList: selected.join(", "), resolvedCols };
}

// ─────────────────────────────────────────────────────────────
// QUERY BUILDER
// Uses ONLY columns that actually exist in the table.
// ORDER BY and WHERE clauses are built from resolvedCols,
// never from hardcoded column names — so it never crashes.
// ─────────────────────────────────────────────────────────────
function buildClaimsQuery(tableName, options = {}) {
  const { years, limit, columnList = "*", resolvedCols = {} } = options;

  let sql = `SELECT ${columnList} FROM ${tableName}`;

  // ── WHERE: year filter ─────────────────────────────────────
  // Only add if we know the actual year column name
  if (years && years.length > 0) {
    const yearCol = YEAR_FILTER_ROLES.map(r => resolvedCols[r]).find(Boolean);
    if (yearCol) {
      const yearList = years.map(y => `'${y}'`).join(", ");
      sql += ` WHERE \`${yearCol}\` IN (${yearList})`;
      console.log(`[databricks] 🗓  Year filter: ${yearCol} IN (${yearList})`);
    } else {
      console.warn("[databricks] ⚠️  Year filter skipped — no year column found in table");
    }
  }

  // ── ORDER BY: intentionally omitted ──────────────────────
  // Databricks ORDER BY on large tables is expensive and unnecessary.
  // JS aggregation in claimsCalculator.js handles all sorting internally.
  // Removing this eliminates the #1 cause of UNRESOLVED_COLUMN crashes.

  if (limit) {
    sql += ` LIMIT ${limit}`;
  }

  return sql;
}

// ─────────────────────────────────────────────────────────────
// INTROSPECT TABLE COLUMNS
// Runs DESCRIBE TABLE to get actual column names before querying
// ─────────────────────────────────────────────────────────────
async function getTableColumns(session, tableName) {
  // ── Strategy 1: DESCRIBE TABLE ────────────────────────────
  try {
    const op = await session.executeStatement(
      `DESCRIBE TABLE ${tableName}`,
      { runAsync: true, maxRows: 200 }
    );
    const rows = await op.fetchAll();
    await op.close();

    // DESCRIBE returns rows with col_name, column_name, or name field
    const cols = rows
      .map(r => r.col_name || r.column_name || r.name || "")
      .filter(c => c && !c.startsWith("#") && c.trim() !== "");

    if (cols.length > 0) {
      console.log(`[databricks] 📋 DESCRIBE: ${cols.length} cols — ${cols.slice(0, 6).join(", ")}...`);
      return cols;
    }
    console.warn("[databricks] ⚠️  DESCRIBE returned 0 columns — trying LIMIT 1 fallback");
  } catch (e) {
    console.warn("[databricks] ⚠️  DESCRIBE failed:", e.message, "— trying LIMIT 1 fallback");
  }

  // ── Strategy 2: SELECT * LIMIT 1 ─────────────────────────
  // Fetch one row and read keys from it — always works
  try {
    const op = await session.executeStatement(
      `SELECT * FROM ${tableName} LIMIT 1`,
      { runAsync: true, maxRows: 1 }
    );
    const rows = await op.fetchAll();
    await op.close();

    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      console.log(`[databricks] 📋 LIMIT 1 fallback: ${cols.length} cols — ${cols.slice(0, 6).join(", ")}...`);
      return cols;
    }
    console.warn("[databricks] ⚠️  LIMIT 1 returned no rows — table may be empty");
  } catch (e) {
    console.warn("[databricks] ⚠️  LIMIT 1 fallback failed:", e.message);
  }

  // ── Strategy 3: Full SELECT * (last resort) ───────────────
  // If both above fail, return empty → buildSafeColumnList uses SELECT *
  console.warn("[databricks] ⚠️  Column introspection failed — will use SELECT * with no WHERE/ORDER BY");
  return [];
}

// ─────────────────────────────────────────────────────────────
// SCHEMA DISCOVERY
// When DATABRICKS_TABLE is not set, try to find the claims table
// ─────────────────────────────────────────────────────────────
async function discoverClaimsTable(session) {
  console.log("[databricks] 🔍 Discovering available tables...");
  try {
    const op = await session.executeStatement("SHOW TABLES", { runAsync: true, maxRows: 100 });
    const tables = await op.fetchAll();
    await op.close();

    const tableNames = tables.map(t =>
      `${t.catalog || t.database || ""}.${t.namespace || t.schema || ""}.${t.tableName || t.name || ""}`.replace(/^\.+|\.+$/g, "")
    );

    // Look for a table with 'claims' or 'insurance' in the name
    const claimsTable = tableNames.find(t =>
      /claims|insurance|hmo|indicators/i.test(t)
    );

    if (claimsTable) {
      console.log(`[databricks] ✅ Discovered table: ${claimsTable}`);
      return claimsTable;
    }

    console.log("[databricks] Tables found:", tableNames.slice(0, 10));
    return tableNames[0] || null;
  } catch (e) {
    console.warn("[databricks] Table discovery failed:", e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// FETCH CLAIMS DATA FROM DATABRICKS
// Connects, queries, normalizes, returns raw claim rows
// ─────────────────────────────────────────────────────────────
async function fetchClaimsFromDatabricks() {
  if (!isDatabricksConfigured()) {
    throw new Error("Databricks not configured. Set DATABRICKS_TOKEN, DATABRICKS_SERVER_HOSTNAME, DATABRICKS_HTTP_PATH in .env");
  }

  console.log("[databricks] 🔌 Connecting to:", DB_CONFIG.host);

  const client = getDBClient();
  await client.connect({
    token:  DB_CONFIG.token,
    host:   DB_CONFIG.host,
    path:   DB_CONFIG.path,
  });

  const session = await client.openSession();
  console.log("[databricks] ✅ Session opened");

  try {
    // Discover table if not set
    let tableName = DB_CONFIG.table;
    if (!tableName) {
      tableName = await discoverClaimsTable(session);
      if (!tableName) {
        throw new Error(
          "No table found. Set DATABRICKS_TABLE=catalog.schema.table_name in backend/.env"
        );
      }
    }

    // Parse policy year filter
    const years = DB_CONFIG.years
      ? DB_CONFIG.years.split(",").map(y => y.trim())
      : null;

    // ── Introspect actual columns before querying ────────────
    console.log(`[databricks] 📊 Introspecting columns: ${tableName}`);
    const actualColumns = await getTableColumns(session, tableName);
    const { columnList, resolvedCols } = buildSafeColumnList(actualColumns);

    const sql = buildClaimsQuery(tableName, { years, limit: DB_CONFIG.maxRows, columnList, resolvedCols });
    console.log(`[databricks] 📊 Querying: ${tableName}`);
    console.log(`[databricks] SQL preview: ${sql.slice(0, 300)}...`);

    const queryOp = await session.executeStatement(sql, {
      runAsync:  true,
      maxRows:   DB_CONFIG.maxRows,
    });

    const rawRows = await queryOp.fetchAll();
    await queryOp.close();

    console.log(`[databricks] ✅ Fetched ${rawRows.length.toLocaleString()} rows`);
    return rawRows;

  } finally {
    await session.close();
    await client.close();
    console.log("[databricks] 🔌 Connection closed");
  }
}

// ─────────────────────────────────────────────────────────────
// LOAD AND AGGREGATE
// Full pipeline: connect → fetch → aggregate → return cache-ready object
// ─────────────────────────────────────────────────────────────
async function loadDatabricksData() {
  const startTime = Date.now();
  console.log("[databricks] 🚀 Starting data load...");

  const rawRows = await fetchClaimsFromDatabricks();

  if (!rawRows || rawRows.length === 0) {
    throw new Error("Databricks returned 0 rows. Check table name and filters.");
  }

  // Validate it's claim-level data
  const sample = rawRows.slice(0, 5);
  const normalized = sample.map(normalizeRow);
  if (!isClaimsLevelData(normalized)) {
    console.warn("[databricks] ⚠️  Data may not be HMO claim-level format — attempting aggregation anyway");
  }

  // Aggregate using shared calculator
  console.log(`[databricks] ⚙️  Aggregating ${rawRows.length.toLocaleString()} claims by Entity...`);
  const clients = aggregateClaimsToClients(rawRows);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[databricks] ✅ Done — ${clients.length} clients from ${rawRows.length.toLocaleString()} claims in ${elapsed}s`);

  return {
    clients,
    stories:    [],
    narratives: {},
    claimsData: rawRows,   // keep raw for drill-downs
    sheets:     {},
    meta: {
      source:        "databricks",
      host:          DB_CONFIG.host,
      table:         DB_CONFIG.table || "auto-discovered",
      parsedAt:      new Date().toISOString(),
      totalClients:  clients.length,
      totalClaims:   rawRows.length,
      dataFormat:    "hmo-claims-level",
      currency:      "₱",
      loadTimeSeconds: parseFloat(elapsed),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// CONNECTION TEST
// Lightweight ping — just connects and runs SELECT 1
// ─────────────────────────────────────────────────────────────
async function testDatabricksConnection() {
  if (!isDatabricksConfigured()) {
    return {
      success: false,
      message: "Databricks credentials not configured in .env",
      configured: false,
    };
  }

  try {
    const client = getDBClient();
    await client.connect({
      token: DB_CONFIG.token,
      host:  DB_CONFIG.host,
      path:  DB_CONFIG.path,
    });
    const session = await client.openSession();

    // Quick row count if table is known
    let rowCount = null;
    if (DB_CONFIG.table) {
      try {
        const op = await session.executeStatement(
          `SELECT COUNT(*) as cnt FROM ${DB_CONFIG.table}`,
          { runAsync: true, maxRows: 1 }
        );
        const result = await op.fetchAll();
        await op.close();
        rowCount = result[0]?.cnt || result[0]?.["count(1)"] || null;
      } catch (e) {
        console.warn("[databricks] Count query failed:", e.message);
      }
    }

    await session.close();
    await client.close();

    return {
      success:    true,
      message:    "Databricks connection successful",
      configured: true,
      host:       DB_CONFIG.host,
      table:      DB_CONFIG.table || "not set",
      rowCount,
    };
  } catch (e) {
    return {
      success:    false,
      message:    e.message,
      configured: true,
      hint: e.message.includes("@databricks/sql")
        ? "Run: npm install @databricks/sql in the backend folder"
        : "Check your Databricks credentials in backend/.env",
    };
  }
}

module.exports = {
  isDatabricksConfigured,
  isDatabricksTableSet,
  fetchClaimsFromDatabricks,
  loadDatabricksData,
  testDatabricksConnection,
  DB_CONFIG,
};
