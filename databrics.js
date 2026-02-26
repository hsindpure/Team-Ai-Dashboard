/**
 * databricksConnector.js — Databricks SQL Data Source
 * ─────────────────────────────────────────────────────
 *
 * Fallback data source when Excel file is not available.
 * Connects to Databricks SQL Warehouse using @databricks/sql,
 * fetches claim-level data, and produces the same client analytics
 * structure as dataParser.js using the shared claimsCalculator.js.
 *
 * Connection (from .env or hardcoded fallback):
 *   DATABRICKS_TOKEN         = 
 *   DATABRICKS_SERVER_HOSTNAME = 
 *   DATABRICKS_HTTP_PATH     = 
 *   DATABRICKS_TABLE         = your_catalog.your_schema.claims_table
 *
 * Install dependency:
 *   npm install @databricks/sql
 *
 * Exports:
 *   isDatabricksConfigured()          → boolean
 *   fetchClaimsFromDatabricks()       → array of raw claim rows
 *   loadDatabricksData()              → { clients, stories, narratives, meta }
 *   testDatabricksConnection()        → { success, message, rowCount? }
 */

const { aggregateClaimsToClients, isClaimsLevelData, normalizeRow } = require("./claimsCalculator");

// ─────────────────────────────────────────────────────────────
// CONFIG — reads from .env, falls back to values from image
// ─────────────────────────────────────────────────────────────
const DB_CONFIG = {
  token:    process.env.DATABRICKS_TOKEN      
  host:     process.env.DATABRICKS_SERVER_HOSTNAME 
  path:     process.env.DATABRICKS_HTTP_PATH      
  // Table to query — set DATABRICKS_TABLE in .env
  // Format: "catalog.schema.table_name"
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

// All columns the system knows about, grouped by canonical role.
// Key   = canonical role used by claimsCalculator.js
// Values= all known raw column name variants (any casing)
const KNOWN_COLUMN_VARIANTS = {
  policy_year:    ["Policy_Year","PolicyYear","policy_year","POLICY_YEAR", "Year","year","YEAR",
    "Policy.Number","Policy_Number","PolicyNumber",],
  month:          ["Month","month","MONTH"],
  month_name:     ["Month_Name","MonthName","month_name","MONTH_NAME"],
  month_year:     ["Month_Year","MonthYear","month_year","MONTH_YEAR"],
  quarter:        ["New_Quarter","NewQuarter","Quarter","quarter","new_quarter"],
  fund:           ["Fund","fund","FUND",    "Industry1","industry1","INDUSTRY1",
    "Industry (group)","Industry_group",],
  claim_type:     ["Final_Claim_Type","FinalClaimType","Claim_Type","ClaimType","claim_type",  "Claim.Type (group)","Claim_Type_group","Claim.Type-1","Claim_Type_1",
    "Claim.Type.level.2","Claim_Type_level_2","Claim.Definition","Claim_Definition",],
  member_type:    ["Member_Type","MemberType","member_type","MEMBER_TYPE"],
  relationship:   ["Relationship","relationship","RELATIONSHIP",    "Relationship (group)","Relationship_group","RelationshipGroup",],
  icd_code:       ["ICD_Code2","ICD_Code","ICDCode2","ICDCode","icd_code2","icd_code",    "Icd.9","Icd_9","ICD9","icd_9",],
  illness:        ["Illness","illness","ILLNESS",  "Diagnosis.Major","Diagnosis_Major","DiagnosisMajor",],
  illness_group:  ["Illness_Group","IllnessGroup","illness_group","ILLNESS_GROUP",    "Grouped.Diagnosis(Updated)","Grouped_Diagnosis_Updated",
    "Grouped.Diagnosis","Grouped_Diagnosis","GroupedDiagnosis",],
  facility:       ["Facility","facility","FACILITY"],
  facility_type:  ["Type_of_Facility","TypeOfFacility","Facility_Type","FacilityType","type_of_facility",  // NEW
    "Provider.Type","Provider_Type","ProviderType",
    "Providers (Hospitals)","Providers_Hospitals",
    "Plan.End.Date","Plan_End_Date",],
  case_count:     ["Case_Count","CaseCount","case_count","CASE_COUNT"],
  plan_level:     ["Plan_Level","PlanLevel","plan_level","PLAN_LEVEL"],
  plan_description:["Plan_Description","PlanDescription","plan_description"],
  age:            ["Age","age","AGE"],
  age_group:      ["Age_Group","AgeGroup","age_group","AGE_GROUP",    "Age.Band","Age_Band","AgeBand",
    "Age.Band (group)","Age_Band_group","AgeBandGroup",],
  billed_amount:  ["Billed_Amount","BilledAmount","billed_amount","BILLED_AMOUNT",  "Submitted.Claim.Amount","Submitted_Claim_Amount","submitted_claim_amount"],
  covered_amount: ["Covered_Amount","CoveredAmount","covered_amount","COVERED_AMOUNT"],
  approved_amount:["APPROVEDAMOUNT","Approved_Amount","ApprovedAmount","approved_amount",  "Paid.Claim","Paid_Claim","PaidClaim","paid_claim",],
  entity:         ["Entity","entity","ENTITY","Company","Organization","Account",  // NEW
    "Client.Name(Updated)","Client Name(Updated)","Client_Name_Updated",
    "Client.Name","Client_Name","ClientName",
    "Client.ID","Client_ID","ClientID",
    "Employee.ID","Employee_ID", ],
  branch:         ["Branch","branch","BRANCH"],
  claim_no:       ["Claim_No","ClaimNo","claim_no","CLAIM_NO"],
  member_id:      ["Masked_Member_ID","MaskedMemberID","masked_member_id",
                   "Masked_Employee_ID","MaskedEmployeeID","masked_employee_id",    "Member.ID","Member_ID","MemberID",
    "Employee.ID","Employee_ID","EmployeeID",],
  year_of_birth:  ["Year_of_Birth","YearOfBirth","year_of_birth","YEAR_OF_BIRTH"],
  gender:         ["Gender","gender","GENDER",  "Gender (group)","Gender_group","GenderGroup",],
  civil_status:   ["Civil_Status","CivilStatus","civil_status","CIVIL_STATUS", "Fili.Status","Fili_Status","FiliStatus",],
  status:         ["Status","status","STATUS",   // NEW
    "Claim.status","Claim_status","ClaimStatus","claim_status"],
  mbl:            ["MBL","mbl","Max_Benefit_Limit","MaxBenefitLimit"],
  category:       ["Category","category","CATEGORY"],

  
};

/**
 * Given the actual column names present in the table,
 * returns a safe SELECT list using only columns that exist.
 * Falls back to SELECT * if nothing matches (safest option).
 */
function buildSafeColumnList(actualColumns) {
  // Normalise actual column names to lowercase for comparison
  const actualLower = actualColumns.map(c => c.toLowerCase().replace(/[\s_]/g, ""));
  const actualMap   = {};
  actualColumns.forEach(c => {
    actualMap[c.toLowerCase().replace(/[\s_]/g, "")] = c; // normalised → real name
  });

  const selected = [];

  for (const [role, variants] of Object.entries(KNOWN_COLUMN_VARIANTS)) {
    // Try each variant — pick the first one that exists in the table
    let found = null;
    for (const variant of variants) {
      const key = variant.toLowerCase().replace(/[\s_]/g, "");
      if (actualMap[key]) {
        found = actualMap[key]; // use the exact casing from the table
        break;
      }
    }
    if (found) selected.push(found);
    // If no variant found, silently skip — calculations degrade gracefully
  }

  if (selected.length === 0) {
    // Nothing matched at all — return everything and let normalizeRow handle it
    console.warn("[databricks] ⚠️  No known columns matched — using SELECT *");
    return "*";
  }

  console.log(`[databricks] ✅ Matched ${selected.length}/${Object.keys(KNOWN_COLUMN_VARIANTS).length} known columns`);
  return selected.join(", ");
}

// ─────────────────────────────────────────────────────────────
// QUERY BUILDER
// Uses SELECT * safely — actual column list introspected first.
// Never crashes on missing or renamed columns.
// ─────────────────────────────────────────────────────────────
function buildClaimsQuery(tableName, options = {}) {
  const { years, limit, columnList = "*" } = options;

  let sql = `SELECT ${columnList} FROM ${tableName}`;

  if (years && years.length > 0) {
    const yearList = years.map(y => `'${y}'`).join(", ");
    // Use the actual Policy_Year column name if known, else try common variants
    sql += ` WHERE Policy_Year IN (${yearList})`;
  }

  sql += ` ORDER BY Entity, Policy_Year, Month`;

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
  try {
    const op = await session.executeStatement(
      `DESCRIBE TABLE ${tableName}`,
      { runAsync: true, maxRows: 200 }
    );
    const rows = await op.fetchAll();
    await op.close();

    // DESCRIBE returns rows with col_name field
    const cols = rows
      .map(r => r.col_name || r.column_name || r.name || "")
      .filter(c => c && !c.startsWith("#")); // skip comment rows Databricks adds

    console.log(`[databricks] 📋 Table has ${cols.length} columns: ${cols.slice(0, 8).join(", ")}${cols.length > 8 ? "..." : ""}`);
    return cols;
  } catch (e) {
    console.warn("[databricks] ⚠️  DESCRIBE failed, falling back to SELECT *:", e.message);
    return []; // empty → buildSafeColumnList returns "*"
  }
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
    const columnList    = buildSafeColumnList(actualColumns);

    const sql = buildClaimsQuery(tableName, { years, limit: DB_CONFIG.maxRows, columnList });
    console.log(`[databricks] 📊 Querying: ${tableName}`);
    console.log(`[databricks] SQL preview: ${sql.slice(0, 200)}...`);

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
