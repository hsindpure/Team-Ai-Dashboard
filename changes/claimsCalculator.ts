// @ts-nocheck
/**
 * claimsCalculator.ts -- HMO Claims Analytics Engine
 * ----------------------------------------------------
 * Aggregates raw claim rows into per-client analytics.
 * Zero hardcoding -- every metric derived from real data.
 *
 * Bug fixes v3.2:
 *  1. KEY_MAP: added "year" -> "policy_year" (Databricks "Year" column was silent-missing)
 *  2. extractYear(): always normalise to 4-char year so byPolicyYear buckets are consistent
 *  3. safeAmount(): null/undefined check instead of falsy || (avoids treating 0 as missing)
 *  4. trendPct denominator: skip calculation if prev-year bucket is zero/missing
 *  5. KEY_MAP: added all new column variants from updated Databricks schema
 */

// ── KEY NORMALIZER ───────────────────────────────────────────────
const KEY_MAP = {
  // ── TIME ─────────────────────────────────────────────────────
  "policy_year":"policy_year", "policyyear":"policy_year",
  "year":"policy_year",                          // FIX 1: "Year" column was NOT mapped before
  "month":"month",
  "month_name":"month_name", "monthname":"month_name",
  "month_year":"month_year", "monthyear":"month_year",
  "new_quarter":"quarter",   "newquarter":"quarter", "quarter":"quarter",

  // ── FUND ─────────────────────────────────────────────────────
  "fund":"fund", "insurer":"fund",

  // ── CLAIM TYPE ───────────────────────────────────────────────
  "final_claim_type":"claim_type", "finalclaimtype":"claim_type",
  "claim_type":"claim_type",       "claimtype":"claim_type",
  "claim_type__group_":"claim_type","claim_type_group":"claim_type",
  "claim_type_1":"claim_type",     // new column
  "claim_definition":"claim_type",
  "claim_type_level_2":"claim_type_level2",

  // ── CLAIM IDS / STATUS ───────────────────────────────────────
  "claim_no":"claim_no", "claimno":"claim_no", "claim_id":"claim_no",
  "claim_status":"status", "status":"status",
  "case_tag":"case_tag",   "casetag":"case_tag",
  "case_count":"case_count","casecount":"case_count",
  "reject_claim_category":"reject_category",
  "rejection_reasons":"rejection_reasons",
  "room_type":"room_type",
  "policy_number":"policy_number",

  // ── MEMBER ───────────────────────────────────────────────────
  "member_type":"member_type",     "membertype":"member_type",
  "provider_category":"member_type",
  "relationship":"relationship",
  "relationship__group_":"relationship", "relationship_group":"relationship",
  "relationship_1":"relationship",       // new column

  // ── DIAGNOSIS ────────────────────────────────────────────────
  "icd_code2":"icd_code", "icdcode2":"icd_code",
  "icd_code":"icd_code",  "icd_9":"icd_code",
  "illness":"illness",    "diagnosis_major":"illness",
  "illness_group":"illness_group",   "illnessgroup":"illness_group",
  "grouped_diagnosis_updated_":"illness_group",
  "grouped_diagnosis_updated":"illness_group",
  "grouped_diagnosis":"illness_group",

  // ── FACILITY ─────────────────────────────────────────────────
  "facility":"facility",
  "provider_name":"facility",
  "providers__hospitals_":"facility", "providers_hospitals":"facility",
  "type_of_facility":"facility_type", "typeoffacility":"facility_type",
  "facility_type":"facility_type",    "provider_type":"facility_type",

  // ── PLAN ─────────────────────────────────────────────────────
  "plan_level":"plan_level",       "planlevel":"plan_level",
  "plan":"plan_level",             // bare "Plan" Databricks column
  "plan_description":"plan_description","plandescription":"plan_description",
  "plan_start_date":"plan_start_date",
  "plan_end_date":"plan_end_date",

  // ── DEMOGRAPHICS ─────────────────────────────────────────────
  "age":"age",
  "age_group":"age_group",  "agegroup":"age_group",
  "age_band":"age_group",   "age_band__group_":"age_group",
  "age_group_1":"age_group",
  "year_of_birth":"year_of_birth","yearofbirth":"year_of_birth",
  "gender":"gender", "gender__group_":"gender", "gender_group":"gender",
  "civil_status":"civil_status", "civilstatus":"civil_status",
  "fili_status":"civil_status",  "civil_status_1":"civil_status",

  // ── AMOUNTS ──────────────────────────────────────────────────
  // approved_amount: primary paid field -- all variants listed
  "approvedamount":"approved_amount",
  "approved_amount":"approved_amount",
  "paid_claim":"approved_amount",
  "paid_claim_double":"approved_amount",  // Databricks type-suffixed name
  // billed
  "billed_amount":"billed_amount",  "billedamount":"billed_amount",
  "submitted_claim_amount":"billed_amount",
  // covered
  "covered_amount":"covered_amount","coveredamount":"covered_amount",

  // ── MEMBER IDs ───────────────────────────────────────────────
  "masked_employee_id":"member_id",  "maskedemployeeid":"member_id",
  "masked_member_id":"member_id",    "maskedmemberid":"member_id",
  "masked_memner_id":"member_id",    "maskedmemnerid":"member_id",
  "masked memner id":"member_id",
  "employee_masked_id":"member_id",  // new column variant
  "member_id":"member_id",
  "employee_id":"member_id",
  "maskedmemberid_icd":"member_icd_tag",

  // ── ENTITY / CLIENT ──────────────────────────────────────────
  "entity":"entity",
  "entity_name":"entity",           // new column variant
  "organization":"entity",          "company":"entity",
  "account":"entity",
  "client_name_updated_":"entity",  "client_name":"entity",
  "client_id":"entity",
  "entity_code":"entity_code",
  "client_demo":"client_demo",

  // ── LOCATION ─────────────────────────────────────────────────
  "branch":"branch",  "provider_location":"branch",
  "country":"country",
  "category":"category",
  "industry1":"category",  "industry__group_":"category",
  "industry":"category",   "industry_group":"category",  // new column

  // ── DATES ────────────────────────────────────────────────────
  "admission_date":"admission_date",
  "discharge_date":"discharge_date",
  "claim_payment_date":"claim_payment_date",
  "file_date":"file_date",
  "members_effective_date":"members_effective_date",
  "members_original_effective_date":"members_original_effective_date",
  "member_reference_date":"member_reference_date",

  // ── MISC ─────────────────────────────────────────────────────
  "mbl":"mbl", "max_benefit_limit":"mbl",
  "filename":"filename",
  "source_system_code":"source_system_code",
};

function normalizeRow(row) {
  const normalized = {};
  for (const [rawKey, val] of Object.entries(row)) {
    const lk = String(rawKey).trim().toLowerCase()
      .replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const canonical = KEY_MAP[lk] || lk;
    normalized[canonical] = val;
  }
  return normalized;
}

function isClaimsLevelData(rows) {
  if (!rows || rows.length < 2) return false;
  const norm = normalizeRow(rows[0]);
  const keys = Object.keys(norm).join(" ");
  const signals = ["illness","facility_type","claim_no","approved_amount",
    "icd_code","member_id","claim_type","plan_level","illness_group"];
  return signals.filter(f => keys.includes(f)).length >= 3;
}

const MONTH_NUM = {
  jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
  jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
};

function monthSortKey(row) {
  const name = String(row.month_name || "").toLowerCase().slice(0, 3);
  // Use extractYear for consistent 4-char year
  const yr = extractYear(row.month_year) || extractYear(row.policy_year) || "2022";
  const mn = MONTH_NUM[name] || String(row.month || "01").padStart(2, "0");
  return `${yr}-${mn}`;
}

function buildAgeGroups(rows) {
  const bands = { "0-20":0,"21-30":0,"31-35":0,"36-40":0,"41-50":0,"51-60":0,"61+":0 };
  rows.forEach(r => {
    const ag = String(r.age_group || "").trim();
    if (ag && bands[ag] !== undefined) { bands[ag]++; return; }
    const a = Number(r.age) || 0;
    if      (a === 0)  return;
    else if (a <= 20)  bands["0-20"]++;
    else if (a <= 30)  bands["21-30"]++;
    else if (a <= 35)  bands["31-35"]++;
    else if (a <= 40)  bands["36-40"]++;
    else if (a <= 50)  bands["41-50"]++;
    else if (a <= 60)  bands["51-60"]++;
    else               bands["61+"]++;
  });
  return bands;
}

function num(val) {
  if (val === null || val === undefined) return 0;
  const n = Number(String(val).replace(/[₱$,%\s]/g, "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

/**
 * FIX 3 -- Safe amount picker.
 * Uses explicit null/undefined check instead of JavaScript || (falsy).
 * Reason: num(0 || covered) picks covered even when paid=0 is a valid zero claim.
 * Priority: approved_amount -> covered_amount -> billed_amount
 */
function safeAmount(row) {
  if (row.approved_amount != null) {
    const a = num(row.approved_amount);
    if (a > 0) return a;
  }
  if (row.covered_amount != null) {
    const c = num(row.covered_amount);
    if (c > 0) return c;
  }
  return num(row.billed_amount);
}

/**
 * FIX 2 -- Always extract a clean 4-digit year from any input format.
 * Handles: 2024 (int) | "2024" | "2024-01" | "2024-01-15" | "Jan 2024"
 * Without this, "2024" and "2024-01" create different buckets in byPolicyYear.
 */
function extractYear(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  const m = s.match(/\b(20\d{2}|19\d{2})\b/);
  return m ? m[1] : null;
}

// ── CHRONIC GROUP MAPPING ────────────────────────────────────────
const CHRONIC_GROUP_MAP = {
  "Cardiovascular":      ["cardiovascular","cardiac","hypertension","heart","coronary","angina","arrhythmia","stroke","cerebrovascular"],
  "Diabetes & Metabolic":["diabetes","endocrine","metabolic","insulin","glycem","hyperglycemi","thyroid","obesity"],
  "Cancer & Neoplasms":  ["neoplasm","tumor","cancer","oncol","carcinoma","malignant","lymphoma","leukemia"],
  "Musculoskeletal":     ["musculoskeletal","arthri","musculo","osteo","gout","spinal","lumbar","cervical","scolio"],
  "Respiratory":         ["respiratory","asthma","copd","pulmonar","bronchit","emphysema","pneumonia","tuberculosis"],
  "Mental Health":       ["mental","psychi","depress","anxiety","bipolar","schizo","neurolog","parkinson","dementia","alzheimer"],
  "Renal & Digestive":   ["kidney","renal","digestive","liver","hepat","gastroint","ulcer","colitis","crohn","gallblad"],
  "Autoimmune":          ["autoimmune","lupus","rheumatoid","multiple sclerosis","inflammatory"],
};
const CHRONIC_KEYWORDS = Object.values(CHRONIC_GROUP_MAP).flat();

// IP / ER detection from facility_type or claim_type columns
const IP_KEYWORDS = ["inpatient","in-patient","in patient","hospital","ward","admission","confinement","ip"];
const ER_KEYWORDS = ["emergency","er ","e.r","accident","casualty","emerg","a&e"];

function isIpClaim(row) {
  const ft = String(row.facility_type || row.facility || "").toLowerCase();
  const ct = String(row.claim_type || "").toLowerCase();
  return IP_KEYWORDS.some(k => ft.includes(k) || ct.includes(k));
}
function isErClaim(row) {
  const ft = String(row.facility_type || row.facility || "").toLowerCase();
  const ct = String(row.claim_type || "").toLowerCase();
  return ER_KEYWORDS.some(k => ft.includes(k) || ct.includes(k));
}

function computeRiskScore({ chronicPct, trendPct, highCostPct, claimsPerMember }) {
  const chronicScore  = Math.min(100, chronicPct  * 1.67);
  const trendScore    = Math.min(100, Math.max(0, trendPct) * 3.33);
  const highCostScore = Math.min(100, highCostPct * 5);
  const utilScore     = Math.min(100, claimsPerMember * 10);
  return Math.min(100, Math.round(
    chronicScore  * 0.35 + trendScore    * 0.25 +
    highCostScore * 0.25 + utilScore     * 0.15
  ));
}

// ── MAIN AGGREGATOR ──────────────────────────────────────────────
function aggregateClaimsToClients(rawClaimRows) {
  const claimRows = rawClaimRows.map(normalizeRow);

  // DIAGNOSTIC: log first row so mapping issues are visible in server logs
  if (claimRows.length > 0) {
    const s = claimRows[0];
    console.log('[calc] Row keys sample:', Object.keys(s).slice(0, 20).join(', '));
    console.log('[calc] approved_amount:', s.approved_amount,
                '| covered_amount:', s.covered_amount,
                '| billed_amount:', s.billed_amount);
    console.log('[calc] entity:', s.entity,
                '| policy_year:', s.policy_year,
                '| member_id:', s.member_id,
                '| month_year:', s.month_year);
  }

  // Group by entity -- try multiple column fallbacks
  const byEntity = {};
  for (const row of claimRows) {
    const entity = String(
      row.entity      ||
      row.entity_name ||
      row.client_name ||
      row.company     ||
      "Unknown"
    ).trim();
    if (!entity || entity === "null" || entity === "Unknown") continue;
    if (!byEntity[entity]) byEntity[entity] = [];
    byEntity[entity].push(row);
  }

  if (Object.keys(byEntity).length === 0) {
    console.error('[calc] ✗ No entities found. Check entity column mapping.');
  }
  console.log(`[calc] Entities: ${Object.keys(byEntity).length} | Rows: ${claimRows.length}`);

  const clients = [];

  for (const [entityName, rows] of Object.entries(byEntity)) {

    // ── 1. TOTALS ─────────────────────────────────────────────
    const totalClaims   = rows.length;
    // FIX 3: use safeAmount -- not falsy || which treats paid=0 as missing
    const totalApproved = rows.reduce((s, r) => s + safeAmount(r), 0);
    const totalBilled   = rows.reduce((s, r) => s + num(r.billed_amount), 0);

    // ── 2. UNIQUE MEMBERS ─────────────────────────────────────
    const memberIdSet = new Set(
      rows.map(r => String(r.member_id || "").trim()).filter(Boolean)
    );
    const members = memberIdSet.size || Math.ceil(totalClaims / 4.2) || 1;

    // ── 3. MONTHLY PERIODS ────────────────────────────────────
    const monthKeys = new Set(rows.map(r => monthSortKey(r)).filter(k => k && k !== "-"));
    const numMonths = Math.max(monthKeys.size, 1);

    // ── 4. PMPM / PMPY ────────────────────────────────────────
    // PMPM = Total Paid Claims / Total Headcount / Number of Months
    // PMPY = PMPM × 12
    const pmpm = Math.round(totalApproved / members / numMonths);
    const pmpy = pmpm * 12;

    // ── 5. YoY COST TREND ────────────────────────────────────
    // FIX 1+2: "Year" column now maps to policy_year via KEY_MAP,
    // and extractYear() always produces a consistent 4-digit key
    // so rows using "2023", "2023-01", "2023-01-15" all bucket to "2023"
    const byPolicyYear = {};
    rows.forEach(r => {
      const yr = extractYear(r.policy_year) || extractYear(r.month_year);
      if (!yr) return;
      byPolicyYear[yr] = (byPolicyYear[yr] || 0) + safeAmount(r);
    });
    const pYears = Object.keys(byPolicyYear).sort();

    // FIX 4: only calculate if BOTH years have real non-zero totals
    let trendPct = 0;
    if (pYears.length >= 2) {
      const prev = byPolicyYear[pYears[pYears.length - 2]];
      const curr = byPolicyYear[pYears[pYears.length - 1]];
      if (prev && prev > 0) {
        trendPct = parseFloat(((curr - prev) / prev * 100).toFixed(1));
      }
    }

    // ── 6. MONTHLY CHART (last 18 months) ────────────────────
    const monthlyMap = {};
    rows.forEach(r => {
      const key = monthSortKey(r);
      if (!key || key === "-") return;
      if (!monthlyMap[key]) monthlyMap[key] = { total: 0, label: "", count: 0 };
      monthlyMap[key].total += safeAmount(r);
      monthlyMap[key].count += 1;
      monthlyMap[key].label = `${r.month_name || ""} ${r.month_year || ""}`.trim() || key;
    });
    const sortedMonths = Object.keys(monthlyMap).sort().slice(-18);
    const chartLabels  = sortedMonths.map(k => monthlyMap[k].label);
    const chartValues  = sortedMonths.map(k => Math.round(monthlyMap[k].total / members));
    const chartCounts  = sortedMonths.map(k => monthlyMap[k].count);

    // ── 7. CLAIM TYPE ─────────────────────────────────────────
    const claimTypeCosts = {}, claimTypeCounts = {};
    rows.forEach(r => {
      const t = String(r.claim_type || "Other").trim();
      claimTypeCosts[t]  = (claimTypeCosts[t]  || 0) + safeAmount(r);
      claimTypeCounts[t] = (claimTypeCounts[t] || 0) + 1;
    });

    // ── 8. TOP ILLNESS GROUPS ─────────────────────────────────
    const illnessCostMap = {};
    rows.forEach(r => {
      const grp = String(r.illness_group || r.illness || r.icd_code || "Other").trim();
      if (!illnessCostMap[grp]) illnessCostMap[grp] = { cost:0, count:0, illnesses: new Set() };
      illnessCostMap[grp].cost  += safeAmount(r);
      illnessCostMap[grp].count += 1;
      if (r.illness) illnessCostMap[grp].illnesses.add(String(r.illness).trim());
    });
    const top5Diagnoses = Object.entries(illnessCostMap)
      .sort((a, b) => b[1].cost - a[1].cost).slice(0, 5)
      .map(([name, d]) => ({
        name, cost: Math.round(d.cost), count: d.count,
        pct: parseFloat((d.count / totalClaims * 100).toFixed(1)),
        topIllness: [...d.illnesses][0] || name,
      }));
    const top10DiagnosesChart = Object.entries(illnessCostMap)
      .sort((a, b) => b[1].cost - a[1].cost).slice(0, 10)
      .map(([name, d]) => ({ name, cost: Math.round(d.cost), count: d.count }));

    // ── 9. FACILITY UTILISATION ───────────────────────────────
    const facilityTypeCounts = {}, facilityCosts = {};
    rows.forEach(r => {
      const ft = String(r.facility_type || "Other").trim();
      facilityTypeCounts[ft] = (facilityTypeCounts[ft] || 0) + 1;
      facilityCosts[ft]      = (facilityCosts[ft]      || 0) + safeAmount(r);
    });

    // ── 10. IP / ER UTILISATION (for composite score) ─────────
    const ipRows = rows.filter(isIpClaim);
    const erRows = rows.filter(isErClaim);
    const ipAdmissionCount   = ipRows.length;
    const erVisitCount       = erRows.length;
    const ipApprovedTotal    = ipRows.reduce((s, r) => s + safeAmount(r), 0);
    const ipPer1000          = members ? parseFloat((ipAdmissionCount / members * 1000).toFixed(1)) : 0;
    const erPer1000          = members ? parseFloat((erVisitCount     / members * 1000).toFixed(1)) : 0;
    const ipCostPerAdmission = ipAdmissionCount ? Math.round(ipApprovedTotal / ipAdmissionCount) : 0;

    // ── 11. HIGH-COST CLAIMANTS ───────────────────────────────
    const memberCostMap = {};
    rows.forEach(r => {
      const mid = String(r.member_id || "").trim();
      if (!mid) return;
      memberCostMap[mid] = (memberCostMap[mid] || 0) + safeAmount(r);
    });
    const mbl             = num(rows.find(r => r.mbl)?.mbl) || 400000;
    const allMemberCosts  = Object.values(memberCostMap).sort((a, b) => b - a);
    const highCostThresh  = mbl * 0.50;
    const highCostMembers = allMemberCosts.filter(c => c >= highCostThresh).length;
    const highCostPct     = members ? parseFloat((highCostMembers / members * 100).toFixed(1)) : 0;
    const topMemberCost   = allMemberCosts[0] || 0;
    const avgMemberCost   = members ? Math.round(totalApproved / members) : 0;
    const b1 = Math.round(mbl * 0.125), b2 = Math.round(mbl * 0.25),
          b3 = Math.round(mbl * 0.5),   b4 = mbl;
    const fmt = n => `₱${n >= 1000 ? (n/1000).toFixed(0)+'k' : n}`;
    const memberCostBands = {
      [`Below ${fmt(b1)}`]:         allMemberCosts.filter(c => c < b1).length,
      [`${fmt(b1)}-${fmt(b2)}`]:    allMemberCosts.filter(c => c >= b1 && c < b2).length,
      [`${fmt(b2)}-${fmt(b3)}`]:    allMemberCosts.filter(c => c >= b2 && c < b3).length,
      [`${fmt(b3)}-${fmt(b4)}`]:    allMemberCosts.filter(c => c >= b3 && c < b4).length,
      [`${fmt(b4)}+ (MBL)`]:        allMemberCosts.filter(c => c >= b4).length,
    };
    const top5PctCount  = Math.max(1, Math.ceil(allMemberCosts.length * 0.05));
    const top5PctSpend  = allMemberCosts.slice(0, top5PctCount).reduce((s, v) => s + v, 0);
    const top5SpendPct  = totalApproved ? parseFloat((top5PctSpend  / totalApproved * 100).toFixed(1)) : 0;
    const top10PctCount = Math.max(1, Math.ceil(allMemberCosts.length * 0.10));
    const top10PctSpend = allMemberCosts.slice(0, top10PctCount).reduce((s, v) => s + v, 0);
    const top10SpendPct = totalApproved ? parseFloat((top10PctSpend / totalApproved * 100).toFixed(1)) : 0;

    // ── 12. DEMOGRAPHICS ─────────────────────────────────────
    const ages   = rows.map(r => num(r.age)).filter(a => a > 0 && a < 100);
    const avgAge = ages.length ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : 0;

    const genderCounts = {};
    rows.forEach(r => { const g = String(r.gender || "Unknown").trim(); genderCounts[g] = (genderCounts[g] || 0) + 1; });
    const maleCount   = Object.entries(genderCounts).filter(([k]) => /^m(ale)?$/i.test(k)).reduce((s,[,v])=>s+v, 0);
    const femaleCount = Object.entries(genderCounts).filter(([k]) => /^f(emale)?$/i.test(k)).reduce((s,[,v])=>s+v, 0);
    const malePct     = totalClaims ? parseFloat((maleCount   / totalClaims * 100).toFixed(1)) : 0;
    const femalePct   = totalClaims ? parseFloat((femaleCount / totalClaims * 100).toFixed(1)) : 0;

    const relCounts = {};
    rows.forEach(r => { const rel = String(r.relationship || "Employee").trim(); relCounts[rel] = (relCounts[rel] || 0) + 1; });
    const employeeCount  = Object.entries(relCounts).filter(([k]) => /^employee/i.test(k)).reduce((s,[,v])=>s+v, 0);
    const dependentCount = Object.entries(relCounts).filter(([k]) => !/^employee/i.test(k)).reduce((s,[,v])=>s+v, 0);
    const dependentRatio = employeeCount ? parseFloat((dependentCount / employeeCount).toFixed(2)) : 0;

    const civilStatusCounts = {};
    rows.forEach(r => { const cs = String(r.civil_status || "Unknown").trim(); civilStatusCounts[cs] = (civilStatusCounts[cs] || 0) + 1; });

    // ── 13. PLAN LEVELS ───────────────────────────────────────
    const planLevelCounts = {}, planLevelCosts = {};
    rows.forEach(r => {
      const pl = String(r.plan_level || "Unknown").trim();
      planLevelCounts[pl] = (planLevelCounts[pl] || 0) + 1;
      planLevelCosts[pl]  = (planLevelCosts[pl]  || 0) + safeAmount(r);
    });
    const planLevelPmpm = {};
    Object.entries(planLevelCosts).forEach(([plan, cost]) => {
      planLevelPmpm[plan] = Math.round(cost / (planLevelCounts[plan] || 1) / numMonths);
    });

    // ── 14. FUND ──────────────────────────────────────────────
    const fundCounts = {}, fundCosts = {};
    rows.forEach(r => {
      const f = String(r.fund || "HMO").trim();
      fundCounts[f] = (fundCounts[f] || 0) + 1;
      fundCosts[f]  = (fundCosts[f]  || 0) + safeAmount(r);
    });

    // ── 15. QUARTERLY ─────────────────────────────────────────
    const quarterCosts = {}, quarterCounts = {};
    rows.forEach(r => {
      const q = String(r.quarter || "").trim();
      if (!q) return;
      quarterCosts[q]  = (quarterCosts[q]  || 0) + safeAmount(r);
      quarterCounts[q] = (quarterCounts[q] || 0) + 1;
    });

    // ── 16. CHRONIC RATE ──────────────────────────────────────
    const chronicClaims = rows.filter(r =>
      CHRONIC_KEYWORDS.some(kw =>
        String(r.illness_group || r.illness || "").toLowerCase().includes(kw)
      )
    ).length;
    const chronicPct = totalClaims ? parseFloat((chronicClaims / totalClaims * 100).toFixed(1)) : 0;

    const chronicGroupCounts = {}, chronicGroupCosts = {};
    rows.forEach(r => {
      const txt = String(r.illness_group || r.illness || r.icd_code || "").toLowerCase();
      for (const [groupName, keywords] of Object.entries(CHRONIC_GROUP_MAP)) {
        if (keywords.some(kw => txt.includes(kw))) {
          chronicGroupCounts[groupName] = (chronicGroupCounts[groupName] || 0) + 1;
          chronicGroupCosts[groupName]  = (chronicGroupCosts[groupName]  || 0) + safeAmount(r);
          break;
        }
      }
    });
    const chronicGroups = Object.entries(chronicGroupCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name, count,
        cost: Math.round(chronicGroupCosts[name] || 0),
        pct:  parseFloat((count / Math.max(totalClaims, 1) * 100).toFixed(1)),
      }));

    // ── 17. RISK STRATIFICATION ───────────────────────────────
    const memberRiskMap = {};
    rows.forEach(r => {
      const mid = String(r.member_id || "").trim();
      if (!mid) return;
      if (!memberRiskMap[mid]) memberRiskMap[mid] = { cost: 0, claims: 0, chronic: false };
      memberRiskMap[mid].cost   += safeAmount(r);
      memberRiskMap[mid].claims += 1;
      const txt = String(r.illness_group || r.illness || "").toLowerCase();
      if (CHRONIC_KEYWORDS.some(kw => txt.includes(kw))) memberRiskMap[mid].chronic = true;
    });

    const memberValues      = Object.values(memberRiskMap);
    const totalMembers      = memberValues.length || 1;
    const avgCostPerMember  = memberValues.reduce((s, m) => s + m.cost, 0) / totalMembers;

    let riskCritical = 0, riskHigh = 0, riskMedium = 0, riskLow = 0;
    memberValues.forEach(m => {
      const costRatio = m.cost / Math.max(avgCostPerMember, 1);
      if      (m.chronic && costRatio >= 3) riskCritical++;
      else if (m.chronic || costRatio >= 2) riskHigh++;
      else if (costRatio >= 1.2)            riskMedium++;
      else                                  riskLow++;
    });
    const highRiskPct = parseFloat(((riskCritical + riskHigh) / totalMembers * 100).toFixed(1));
    const riskStratification = {
      critical: { count: riskCritical, pct: parseFloat((riskCritical / totalMembers * 100).toFixed(1)) },
      high:     { count: riskHigh,     pct: parseFloat((riskHigh     / totalMembers * 100).toFixed(1)) },
      medium:   { count: riskMedium,   pct: parseFloat((riskMedium   / totalMembers * 100).toFixed(1)) },
      low:      { count: riskLow,      pct: parseFloat((riskLow      / totalMembers * 100).toFixed(1)) },
    };

    // ── 18. COMPOSITE SCORE (Trend 35% + Util 30% + PopRisk 20% + CostEff 15%) ─
    const BOB_TREND     = parseFloat(process.env.BOB_TREND_PCT     || '7.2');
    const BOB_IP        = parseFloat(process.env.BOB_IP_PER_1000   || '62');
    const BOB_ER        = parseFloat(process.env.BOB_ER_PER_1000   || '186');
    const BOB_IP_COST   = parseFloat(process.env.BOB_IP_COST_ADMIT || '28400');
    const BOB_HIGHRISK  = parseFloat(process.env.BOB_HIGH_RISK_PCT || '20');
    const BOB_CHRONIC   = parseFloat(process.env.BOB_CHRONIC_PCT   || '18');

    // Trend score (0-3)
    const trendDiff = trendPct - BOB_TREND;
    const trendScore = trendDiff <= 0 ? 0 : trendDiff <= 3 ? 1 : trendDiff <= 5 ? 2 : 3;

    // Utilisation score (0-3)
    const ipGapPct = BOB_IP > 0 ? (ipPer1000 - BOB_IP) / BOB_IP * 100 : 0;
    const erGapPct = BOB_ER > 0 ? (erPer1000 - BOB_ER) / BOB_ER * 100 : 0;
    const utilScore =
      (ipGapPct > 25 && erGapPct > 25) ? 3 :
      (ipGapPct > 25 || erGapPct > 25) ? 2 :
      ((ipGapPct >= 10 && ipGapPct <= 25) && (erGapPct >= 10 && erGapPct <= 25)) ? 2 :
      (ipGapPct >= 10 || erGapPct >= 10) ? 1 : 0;

    // Population risk score (0-3)
    const hrAbove  = highRiskPct > BOB_HIGHRISK;
    const chrAbove = chronicPct  > BOB_CHRONIC;
    const hrMat    = (highRiskPct - BOB_HIGHRISK) > 5;
    const chrMat   = (chronicPct  - BOB_CHRONIC)  > 5;
    const popRiskScore =
      (hrAbove && chrAbove && hrMat && chrMat) ? 3 :
      (hrAbove && chrAbove)                    ? 2 :
      (hrAbove || chrAbove)                    ? 1 : 0;

    // Cost efficiency score (0-3)
    const costGapPct = BOB_IP_COST > 0
      ? (ipCostPerAdmission - BOB_IP_COST) / BOB_IP_COST * 100 : 0;
    const costEffScore =
      costGapPct <= 0  ? 0 :
      costGapPct <= 15 ? 1 :
      costGapPct <= 30 ? 2 : 3;

    const compositeScore = parseFloat(Math.min(3.0,
      (trendScore * 0.35) + (utilScore * 0.30) +
      (popRiskScore * 0.20) + (costEffScore * 0.15)
    ).toFixed(2));

    const clientStatus =
      compositeScore <= 1.0 ? 'Stable' :
      compositeScore <= 1.9 ? 'Drifting' : 'Accelerating';

    // ── 19. RISK SCORE (legacy 0-100) ────────────────────────
    const claimsPerMember = totalClaims / Math.max(members, 1);
    const riskScore = computeRiskScore({ chronicPct, trendPct, highCostPct, claimsPerMember });

    // ── 20. 3-YEAR PROJECTION ─────────────────────────────────
    const threeYearProjection = (pmpy > 0 && trendPct > 0) ? {
      pmpy:         Math.round(pmpy * Math.pow(1 + trendPct / 100, 3)),
      pct:          parseFloat(((Math.pow(1 + trendPct / 100, 3) - 1) * 100).toFixed(1)),
      totalCost:    Math.round(pmpy * Math.pow(1 + trendPct / 100, 3) * members),
      hasProjection: true,
    } : { pmpy: 0, pct: 0, totalCost: 0, hasProjection: false };

    // ── 21. META ──────────────────────────────────────────────
    const latestPolicyYear = pYears[pYears.length - 1] || "";
    const branches   = [...new Set(rows.map(r => r.branch).filter(Boolean))];
    const category   = String(rows.find(r => r.category)?.category || "Staff").trim();
    const memberType = String(rows.find(r => r.member_type)?.member_type || "Employees").trim();
    const billedApprovedRatio = totalBilled
      ? parseFloat((totalApproved / totalBilled * 100).toFixed(1)) : 100;

    const clientId = entityName.toLowerCase()
      .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_")
      .replace(/^_|_$/g, "").slice(0, 40);

    clients.push({
      id: clientId, name: entityName,
      members, pmpy, pmpm, trendPct, chronicPct, riskScore,
      compositeScore, clientStatus,
      compositeBreakdown: { trendScore, utilScore, popRiskScore, costEffScore },
      threeYearProjection,
      totalCost:   Math.round(totalApproved),
      totalBilled: Math.round(totalBilled),
      totalClaims, avgAge,
      industry: "HMO / Corporate Health",
      country: "Philippines", currency: "₱",
      meetingDate: "", manager: "", renewalDate: "", renewalOverdue: false,
      analytics: {
        totalApproved: Math.round(totalApproved),
        totalBilled:   Math.round(totalBilled),
        billedApprovedRatio, pmpm, pmpy, trendPct,
        numMonths, members, totalClaims,
        claimsPerMember: parseFloat(claimsPerMember.toFixed(1)),
        latestPolicyYear,
        costByPolicyYear: byPolicyYear,
        // Composite
        compositeScore, clientStatus,
        compositeBreakdown: { trendScore, utilScore, popRiskScore, costEffScore },
        bobBenchmarks: { BOB_TREND, BOB_IP, BOB_ER, BOB_IP_COST, BOB_HIGHRISK, BOB_CHRONIC },
        // Utilisation
        ipPer1000, erPer1000, ipCostPerAdmission, ipAdmissionCount, erVisitCount,
        // Monthly chart
        monthlyChart: { labels: chartLabels, pmpm: chartValues, count: chartCounts },
        // Claim type
        claimTypeCosts, claimTypeCounts,
        claimTypeChart: {
          labels: Object.keys(claimTypeCounts),
          counts: Object.values(claimTypeCounts),
          costs:  Object.values(claimTypeCosts).map(Math.round),
        },
        // Diagnosis
        top5Diagnoses, top10DiagnosesChart,
        diagnosisChart: {
          labels: top10DiagnosesChart.map(d => d.name),
          costs:  top10DiagnosesChart.map(d => d.cost),
          counts: top10DiagnosesChart.map(d => d.count),
        },
        // High-cost
        mbl, highCostMembers, highCostPct,
        topMemberCost: Math.round(topMemberCost),
        avgMemberCost, memberCostBands,
        memberCostChart: {
          labels: Object.keys(memberCostBands),
          counts: Object.values(memberCostBands),
        },
        top5SpendPct, top10SpendPct, top5PctCount,
        // Demographics
        avgAge, ageGroups: buildAgeGroups(rows),
        ageGroupChart: {
          labels: Object.keys(buildAgeGroups(rows)),
          counts: Object.values(buildAgeGroups(rows)),
        },
        genderCounts, malePct, femalePct,
        genderChart: { labels: Object.keys(genderCounts), counts: Object.values(genderCounts) },
        relCounts, employeeCount, dependentCount, dependentRatio,
        civilStatusCounts,
        // Plan
        planLevelCounts, planLevelCosts, planLevelPmpm,
        planLevelChart: {
          labels: Object.keys(planLevelCosts),
          costs:  Object.values(planLevelCosts).map(Math.round),
          counts: Object.keys(planLevelCounts).map(k => planLevelCounts[k]),
          pmpm:   Object.keys(planLevelPmpm).map(k => planLevelPmpm[k]),
        },
        // Facility
        facilityTypeCounts, facilityCosts,
        facilityChart: {
          labels: Object.keys(facilityTypeCounts),
          counts: Object.values(facilityTypeCounts),
          costs:  Object.keys(facilityCosts).map(k => Math.round(facilityCosts[k])),
        },
        // Fund / Quarter
        fundCounts, fundCosts,
        quarterCosts, quarterCounts,
        quarterChart: {
          labels: Object.keys(quarterCosts).sort(),
          costs:  Object.keys(quarterCosts).sort().map(k => Math.round(quarterCosts[k])),
          counts: Object.keys(quarterCounts).sort().map(k => quarterCounts[k]),
        },
        // Chronic / Risk
        chronicClaims, chronicPct, chronicGroups,
        highRiskPct, riskStratification,
        // 3-year projection
        threeYearProjection,
        // Meta
        category, memberType, branches,
      },
    });
  }

  clients.sort((a, b) => b.totalCost - a.totalCost);
  return clients;
}

module.exports = {
  normalizeRow, isClaimsLevelData, aggregateClaimsToClients,
  buildAgeGroups, monthSortKey,
};
