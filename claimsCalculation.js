/**
 * claimsCalculator.js — Shared HMO Claims Analytics Engine
 * ──────────────────────────────────────────────────────────
 *
 * Single source of truth for ALL KPI and chart calculations.
 * Used by both dataParser.js (Excel) and databricksConnector.js.
 *
 * Input:  raw claim rows (array of objects, any column name casing)
 * Output: aggregated client records with full analytics blocks
 *
 * Field mapping handles both:
 *   • Excel sanitized keys:  "approvedamount", "illness_group", "masked_member_id"
 *   • Databricks raw keys:   "APPROVEDAMOUNT", "Illness_Group", "Masked Member ID"
 *
 * Exports:
 *   normalizeRow(row)                    → normalized row with consistent keys
 *   isClaimsLevelData(rows)              → detect if rows are claim-level
 *   aggregateClaimsToClients(claimRows)  → array of client objects with analytics
 *   buildAgeGroups(rows)                 → age band counts
 *   monthSortKey(row)                    → "2023-02" sort string
 */

// ─────────────────────────────────────────────────────────────
// KEY NORMALIZER
// Maps all known column name variants → canonical snake_case key
// Works for Excel (already sanitized) AND Databricks (raw headers)
// ─────────────────────────────────────────────────────────────
const KEY_MAP = {
  // Policy / time
  "policy_year":                    "policy_year",
  "policyyear":                     "policy_year",
  "month":                          "month",
  "month_name":                     "month_name",
  "monthname":                      "month_name",
  "month_year":                     "month_year",
  "monthyear":                      "month_year",
  "new_quarter":                    "quarter",
  "newquarter":                     "quarter",
  "quarter":                        "quarter",

  // Fund / claim type
  "fund":                           "fund",
  "final_claim_type":               "claim_type",
  "finalclaimtype":                 "claim_type",
  "claim_type":                     "claim_type",
  "claimtype":                      "claim_type",

  // Member
  "member_type":                    "member_type",
  "membertype":                     "member_type",
  "relationship":                   "relationship",

  // Diagnosis
  "icd_code2":                      "icd_code",
  "icdcode2":                       "icd_code",
  "icd_code":                       "icd_code",
  "illness":                        "illness",
  "illness_group":                  "illness_group",
  "illnessgroup":                   "illness_group",

  // Facility
  "facility":                       "facility",
  "type_of_facility":               "facility_type",
  "typeoffacility":                 "facility_type",
  "facility_type":                  "facility_type",

  // Case
  "case_tag":                       "case_tag",
  "casetag":                        "case_tag",
  "case_count":                     "case_count",
  "casecount":                      "case_count",
  "claim_no":                       "claim_no",
  "claimno":                        "claim_no",

  // Plan
  "plan_level":                     "plan_level",
  "planlevel":                      "plan_level",
  "plan_description":               "plan_description",
  "plandescription":                "plan_description",

  // Demographics
  "age":                            "age",
  "age_group":                      "age_group",
  "agegroup":                       "age_group",
  "year_of_birth":                  "year_of_birth",
  "yearofbirth":                    "year_of_birth",
  "gender":                         "gender",
  "civil_status":                   "civil_status",
  "civilstatus":                    "civil_status",

  // Amounts
  "billed_amount":                  "billed_amount",
  "billedamount":                   "billed_amount",
  "covered_amount":                 "covered_amount",
  "coveredamount":                  "covered_amount",
  "approvedamount":                 "approved_amount",
  "approved_amount":                "approved_amount",

  // Member IDs
  "maskedmemberid + icd":           "member_icd_tag",
  "masked_employee_id":             "member_id",
  "maskedemployeeid":               "member_id",
  "masked_member_id":               "member_id",
  "maskedmemberid":                 "member_id",
  "masked memner id":               "member_id",  // typo in source data
  "masked_memner_id":               "member_id",  // typo in source data
  "maskedmemnerid":                 "member_id",

  // Entity / company
  "entity":                         "entity",
  "organization":                   "entity",
  "company":                        "entity",
  "account":                        "entity",
  "branch":                         "branch",

  // Other
  "status":                         "status",
  "mbl":                            "mbl",
  "filename":                       "filename",
  "category":                       "category",

  // ── NEW SCHEMA (dot-notation, after normalizeRow strips dots) ──

  // Entity / client identity
  "client_name_updated":        "entity",   // Client.Name(Updated)
  "client_name":                "entity",   // Client.Name
  "client_id":                  "entity",   // Client.ID (use as entity if no Entity col)
  "employee_id":                "member_id", // Employee.ID
  "member_id":                  "member_id", // Member.ID (direct)

  // Amounts
  "paid_claim":                 "approved_amount",  // Paid.Claim = what was actually paid
  "submitted_claim_amount":     "billed_amount",    // Submitted.Claim.Amount = billed

  // Claim type
  "claim_type_group":           "claim_type",   // Claim.Type (group)
  "claim_type-1":               "claim_type",   // Claim.Type-1
  "claim_type_1":               "claim_type",   // after dot→underscore
  "claim_type_level_2":         "claim_type",   // Claim.Type.level.2
  "claim_definition":           "claim_type",   // Claim.Definition fallback

  // Diagnosis / illness
  "grouped_diagnosis_updated":  "illness_group",  // Grouped.Diagnosis(Updated)
  "grouped_diagnosis":          "illness_group",  // Grouped.Diagnosis
  "diagnosis_major":            "illness",        // Diagnosis.Major
  "icd_9":                      "icd_code",       // Icd.9

  // Facility / provider
  "provider_type":              "facility_type",  // Provider.Type (clinic/hospital)
  "providers_hospitals":        "facility",       // Providers (Hospitals) = facility name
  "plan_end_date":              "plan_description", // Plan.End.Date → plan info
  "plan_start_date":            "plan_description", // Plan.Start.Date fallback
  "provider_name":              "facility",       // Provider.Name = facility name
  "provider_category":          "member_type",    // Provider.Category → member type
  "provider_location":          "branch",         // Provider.Location → branch

  // Time / policy
  "year":                       "policy_year",    // Year → policy year
  "policy_number":              "policy_year",    // Policy.Number fallback
  "admission_date":             "admission_date", // kept raw, used in monthSortKey
  "discharge_date":             "discharge_date",
  "member_reference_date":      "member_reference_date",

  // Demographics
  "age_band":                   "age_group",      // Age.Band
  "age_band_group":             "age_group",      // Age.Band (group)
  "gender_group":               "gender",         // Gender (group)
  "relationship_group":         "relationship",   // Relationship (group)
  "fili_status":                "civil_status",   // Fili.Status = civil/filing status

  // Industry / insurer
  "industry1":                  "fund",           // Industry1 → fund type
  "industry_group":             "category",       // Industry (group) → category
  "industry":                   "category",       // Industry → category
  "insurer":                    "insurer",        // kept for reference
  "claim_status":               "status",         // Claim.status
  "reject_claim_category":      "reject_category",
  "rejection_reasons":          "rejection_reason",
  "room_type":                  "room_type",
};

/**
 * Normalize one raw claim row to canonical keys.
 * Handles any casing: "APPROVEDAMOUNT", "Approved Amount", "approvedamount"
 */
function normalizeRow(row) {
  const normalized = {};
  for (const [rawKey, val] of Object.entries(row)) {
    const lk = String(rawKey)
      .trim()
      .toLowerCase()
      .replace(/\./g, "_")          // Claim.Type → claim_type
      .replace(/[()]/g, "")         // Age.Band (group) → age_band__group → cleaned
      .replace(/\s+/g, "_")         // spaces → underscore
      .replace(/_+/g, "_")          // collapse multiple underscores
      .replace(/^_|_$/g, "");       // trim leading/trailing underscores
    const canonical = KEY_MAP[lk] || lk;
    normalized[canonical] = val;
  }
  return normalized;
}
// ─────────────────────────────────────────────────────────────
// DETECT CLAIM-LEVEL DATA
// ─────────────────────────────────────────────────────────────
function isClaimsLevelData(rows) {
  if (!rows || rows.length < 2) return false;
  // Normalize first row and check for claim signals
  const norm = normalizeRow(rows[0]);
  const keys = Object.keys(norm).join(" ");
  const signals = ["illness", "facility_type", "claim_no", "approved_amount",
    "icd_code", "member_id", "claim_type", "plan_level", "illness_group"];
  return signals.filter(f => keys.includes(f)).length >= 3;
}

// ─────────────────────────────────────────────────────────────
// MONTH SORT KEY  →  "2023-02"
// ─────────────────────────────────────────────────────────────
const MONTH_NUM = {
  jan:"01", feb:"02", mar:"03", apr:"04", may:"05", jun:"06",
  jul:"07", aug:"08", sep:"09", oct:"10", nov:"11", dec:"12",
};
// function monthSortKey(row) {
//   const name = String(row.month_name || "").toLowerCase().slice(0, 3);
//   const yr   = String(row.month_year || row.policy_year || "2022").slice(0, 4);
//   const mn   = MONTH_NUM[name] || String(row.month || "01").padStart(2, "0");
//   return `${yr}-${mn}`;
// }
// ✅ REPLACE WITH — also handles Admission.Date and Year column
function monthSortKey(row) {
  // Try standard fields first
  const name = String(row.month_name || "").toLowerCase().slice(0, 3);
  if (name && MONTH_NUM[name]) {
    const yr = String(row.month_year || row.policy_year || row.year || "2022").slice(0, 4);
    return `${yr}-${MONTH_NUM[name]}`;
  }

  // Try numeric month field
  const mn = String(row.month || "").trim();
  if (mn && !isNaN(Number(mn))) {
    const yr = String(row.month_year || row.policy_year || row.year || "2022").slice(0, 4);
    return `${yr}-${String(Number(mn)).padStart(2, "0")}`;
  }

  // Try Admission.Date → "5/31/2022 0:00" or "2022-05-31"
  const dateStr = String(row.admission_date || row.member_reference_date || "").trim();
  if (dateStr && dateStr !== "null") {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      return `${yr}-${mo}`;
    }
  }

  // Try Year column alone (gives year-level granularity)
  const yr = String(row.policy_year || row.year || "").slice(0, 4);
  if (yr && !isNaN(Number(yr))) return `${yr}-01`;

  return "-"; // unknown — excluded from chart
}

// ─────────────────────────────────────────────────────────────
// AGE GROUPS
// ─────────────────────────────────────────────────────────────
function buildAgeGroups(rows) {
  const bands = { "0-20":0, "21-30":0, "31-35":0, "36-40":0, "41-50":0, "51-60":0, "61+":0 };
  rows.forEach(r => {
    const ag = String(r.age_group || "").trim();
    if (ag && bands[ag] !== undefined) { bands[ag]++; return; }
    const a = Number(r.age) || 0;
    if      (a === 0) return;
    else if (a <= 20) bands["0-20"]++;
    else if (a <= 30) bands["21-30"]++;
    else if (a <= 35) bands["31-35"]++;
    else if (a <= 40) bands["36-40"]++;
    else if (a <= 50) bands["41-50"]++;
    else if (a <= 60) bands["51-60"]++;
    else              bands["61+"]++;
  });
  return bands;
}

// ─────────────────────────────────────────────────────────────
// SAFE NUMBER HELPER
// ─────────────────────────────────────────────────────────────
function num(val) {
  if (val === null || val === undefined) return 0;
  const n = Number(String(val).replace(/[₱$,%\s]/g, "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

// ─────────────────────────────────────────────────────────────
// MAIN AGGREGATOR
// Groups normalized rows by entity, computes all KPIs per company
// ─────────────────────────────────────────────────────────────
function aggregateClaimsToClients(rawClaimRows) {

  // Normalize all rows first
  const claimRows = rawClaimRows.map(normalizeRow);

  // Group by entity
  const byEntity = {};
  for (const row of claimRows) {
    const entity = String(row.entity || "Unknown").trim();
    if (!entity || entity === "null" || entity === "Unknown") continue;
    if (!byEntity[entity]) byEntity[entity] = [];
    byEntity[entity].push(row);
  }

  const clients = [];

  for (const [entityName, rows] of Object.entries(byEntity)) {

    // ── 1. TOTALS ────────────────────────────────────────────
    const totalClaims   = rows.length;
    const totalApproved = rows.reduce((s, r) => s + num(r.approved_amount || r.covered_amount), 0);
    const totalBilled   = rows.reduce((s, r) => s + num(r.billed_amount), 0);

    // ── 2. UNIQUE MEMBERS ────────────────────────────────────
    const memberIdSet = new Set(
      rows.map(r => String(r.member_id || "").trim()).filter(Boolean)
    );
    const members = memberIdSet.size || Math.ceil(totalClaims / 3) || 1;

    // ── 3. PMPM / PMPY ──────────────────────────────────────
    const monthKeys = new Set(rows.map(r => monthSortKey(r)).filter(k => k && k !== "-"));
    const numMonths = Math.max(monthKeys.size, 1);
    const pmpm      = Math.round(totalApproved / members / numMonths);
    const pmpy      = pmpm * 12;

    // ── 4. YoY COST TREND ────────────────────────────────────
    const byPolicyYear = {};
    rows.forEach(r => {
      const yr = String(r.policy_year || r.month_year || "").slice(0, 7);
      if (!yr) return;
      byPolicyYear[yr] = (byPolicyYear[yr] || 0) + num(r.approved_amount);
    });
    const pYears = Object.keys(byPolicyYear).sort();
    let trendPct = 0;
    if (pYears.length >= 2) {
      const prev = byPolicyYear[pYears[pYears.length - 2]] || 1;
      const curr = byPolicyYear[pYears[pYears.length - 1]] || 0;
      trendPct   = parseFloat(((curr - prev) / prev * 100).toFixed(1));
    }

    // ── 5. MONTHLY COST CHART (PMPM per month, last 18 months) ─
    const monthlyMap = {};
    rows.forEach(r => {
      const key = monthSortKey(r);
      if (!key || key === "-") return;
      if (!monthlyMap[key]) monthlyMap[key] = { total: 0, label: "", count: 0 };
      monthlyMap[key].total += num(r.approved_amount);
      monthlyMap[key].count += 1;
      monthlyMap[key].label  = `${r.month_name || ""} ${r.month_year || ""}`.trim() || key;
    });
    const sortedMonths = Object.keys(monthlyMap).sort().slice(-18);
    const chartLabels  = sortedMonths.map(k => monthlyMap[k].label);
    const chartValues  = sortedMonths.map(k => Math.round(monthlyMap[k].total / members));
    const chartCounts  = sortedMonths.map(k => monthlyMap[k].count); // claim count per month

    // ── 6. CLAIM TYPE BREAKDOWN ──────────────────────────────
    const claimTypeCosts = {}, claimTypeCounts = {};
    rows.forEach(r => {
      const t = String(r.claim_type || "Other").trim();
      claimTypeCosts[t]  = (claimTypeCosts[t]  || 0) + num(r.approved_amount);
      claimTypeCounts[t] = (claimTypeCounts[t] || 0) + 1;
    });

    // ── 7. TOP 5 ILLNESS GROUPS ──────────────────────────────
    const illnessCostMap = {};
    rows.forEach(r => {
      const grp = String(r.illness_group || r.illness || r.icd_code || "Other").trim();
      if (!illnessCostMap[grp]) illnessCostMap[grp] = { cost:0, count:0, illnesses: new Set() };
      illnessCostMap[grp].cost  += num(r.approved_amount);
      illnessCostMap[grp].count += 1;
      if (r.illness) illnessCostMap[grp].illnesses.add(String(r.illness).trim());
    });
    const top5Diagnoses = Object.entries(illnessCostMap)
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 5)
      .map(([name, d]) => ({
        name,
        cost:       Math.round(d.cost),
        count:      d.count,
        pct:        parseFloat((d.count / totalClaims * 100).toFixed(1)),
        topIllness: [...d.illnesses][0] || name,
      }));

    // Top 10 for chart (illness group bar chart)
    const top10DiagnosesChart = Object.entries(illnessCostMap)
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 10)
      .map(([name, d]) => ({ name, cost: Math.round(d.cost), count: d.count }));

    // ── 8. FACILITY UTILISATION ──────────────────────────────
    const facilityTypeCounts = {}, facilityCosts = {};
    rows.forEach(r => {
      const ft = String(r.facility_type || "Other").trim();
      facilityTypeCounts[ft] = (facilityTypeCounts[ft] || 0) + 1;
      facilityCosts[ft]      = (facilityCosts[ft]      || 0) + num(r.approved_amount);
    });

    // ── 9. HIGH-COST CLAIMANTS ───────────────────────────────
    const memberCostMap = {};
    rows.forEach(r => {
      const mid = String(r.member_id || "").trim();
      if (!mid) return;
      memberCostMap[mid] = (memberCostMap[mid] || 0) + num(r.approved_amount);
    });
    const mbl             = num(rows[0]?.mbl) || 400000;
    const allMemberCosts  = Object.values(memberCostMap).sort((a, b) => b - a);
    const highCostThresh  = mbl * 0.50;
    const highCostMembers = allMemberCosts.filter(c => c >= highCostThresh).length;
    const highCostPct     = members ? parseFloat((highCostMembers / members * 100).toFixed(1)) : 0;
    const topMemberCost   = allMemberCosts[0] || 0;
    const avgMemberCost   = members ? Math.round(totalApproved / members) : 0;

    // Member cost distribution for chart
    const memberCostBands = {
      "Below ₱50k":   allMemberCosts.filter(c => c < 50000).length,
      "₱50k–100k":    allMemberCosts.filter(c => c >= 50000  && c < 100000).length,
      "₱100k–200k":   allMemberCosts.filter(c => c >= 100000 && c < 200000).length,
      "₱200k–400k":   allMemberCosts.filter(c => c >= 200000 && c < 400000).length,
      "₱400k+ (MBL)": allMemberCosts.filter(c => c >= 400000).length,
    };

    // ── 10. CENSUS — DEMOGRAPHICS ────────────────────────────
    const ages   = rows.map(r => num(r.age)).filter(a => a > 0 && a < 100);
    const avgAge = ages.length
      ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : 0;

    const genderCounts = {};
    rows.forEach(r => {
      const g = String(r.gender || "Unknown").trim();
      genderCounts[g] = (genderCounts[g] || 0) + 1;
    });
    const maleCount   = genderCounts["Male"]   || genderCounts["MALE"]   || 0;
    const femaleCount = genderCounts["Female"] || genderCounts["FEMALE"] || 0;
    const malePct     = totalClaims ? parseFloat((maleCount   / totalClaims * 100).toFixed(1)) : 0;
    const femalePct   = totalClaims ? parseFloat((femaleCount / totalClaims * 100).toFixed(1)) : 0;

    const relCounts = {};
    rows.forEach(r => {
      const rel = String(r.relationship || "Employee").trim();
      relCounts[rel] = (relCounts[rel] || 0) + 1;
    });
    const employeeCount  = relCounts["Employee"] || relCounts["EMPLOYEE"] || 0;
    const dependentCount = Object.entries(relCounts)
      .filter(([k]) => !k.toLowerCase().startsWith("employee"))
      .reduce((s, [, v]) => s + v, 0);
    const dependentRatio = employeeCount
      ? parseFloat((dependentCount / employeeCount).toFixed(2)) : 0;

    const civilStatusCounts = {};
    rows.forEach(r => {
      const cs = String(r.civil_status || "Unknown").trim();
      civilStatusCounts[cs] = (civilStatusCounts[cs] || 0) + 1;
    });

    // ── 11. PLAN LEVELS ──────────────────────────────────────
    const planLevelCounts = {}, planLevelCosts = {};
    rows.forEach(r => {
      const pl = String(r.plan_level || "Unknown").trim();
      planLevelCounts[pl] = (planLevelCounts[pl] || 0) + 1;
      planLevelCosts[pl]  = (planLevelCosts[pl]  || 0) + num(r.approved_amount);
    });

    // Plan PMPM per level
    const planLevelPmpm = {};
    Object.entries(planLevelCosts).forEach(([plan, cost]) => {
      const cnt = planLevelCounts[plan] || 1;
      planLevelPmpm[plan] = Math.round(cost / cnt / numMonths);
    });

    // ── 12. FUND TYPE ────────────────────────────────────────
    const fundCounts = {}, fundCosts = {};
    rows.forEach(r => {
      const f = String(r.fund || "HMO").trim();
      fundCounts[f] = (fundCounts[f] || 0) + 1;
      fundCosts[f]  = (fundCosts[f]  || 0) + num(r.approved_amount);
    });

    // ── 13. QUARTERLY BREAKDOWN ──────────────────────────────
    const quarterCosts = {}, quarterCounts = {};
    rows.forEach(r => {
      const q = String(r.quarter || "").trim();
      if (!q) return;
      quarterCosts[q]  = (quarterCosts[q]  || 0) + num(r.approved_amount);
      quarterCounts[q] = (quarterCounts[q] || 0) + 1;
    });

    // ── 14. CHRONIC DISEASE RATE ─────────────────────────────
    const CHRONIC_GROUPS = ["cardiovascular","endocrine","metabolic","neoplasm",
      "nervous","musculoskeletal","respiratory","digestive","oncology"];
    const chronicClaims = rows.filter(r =>
      CHRONIC_GROUPS.some(g =>
        String(r.illness_group || r.illness || "").toLowerCase().includes(g)
      )
    ).length;
    const chronicPct = totalClaims
      ? parseFloat((chronicClaims / totalClaims * 100).toFixed(1)) : 0;

    // ── 15. COMPOSITE RISK SCORE ─────────────────────────────
    const riskScore = Math.min(100, Math.round(
      (chronicPct * 0.35) +
      (Math.min(Math.abs(trendPct), 30) * 1.2) +
      (highCostPct * 1.8) +
      15
    ));

    // ── 16. BILLED vs APPROVED RATIO ────────────────────────
    const billedApprovedRatio = totalBilled
      ? parseFloat((totalApproved / totalBilled * 100).toFixed(1)) : 100;

    // ── 17. META ─────────────────────────────────────────────
    const latestPolicyYear = pYears[pYears.length - 1] || "";
    const branches   = [...new Set(rows.map(r => r.branch).filter(Boolean))];
    const category   = String(rows.find(r => r.category)?.category || "Staff").trim();
    const memberType = String(rows.find(r => r.member_type)?.member_type || "Employees").trim();

    const clientId = entityName.toLowerCase()
      .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_")
      .replace(/^_|_$/g, "").slice(0, 40);

    // ── ASSEMBLE ─────────────────────────────────────────────
    clients.push({
      // Standard display fields
      id:          clientId,
      name:        entityName,
      members,
      pmpy,
      pmpm,
      trendPct,
      chronicPct,
      riskScore,
      totalCost:   Math.round(totalApproved),
      totalBilled: Math.round(totalBilled),
      totalClaims,
      avgAge,
      industry:    "HMO / Corporate Health",
      country:     "Philippines",
      currency:    "₱",

      // Full analytics — used by AI prompts and frontend charts
      analytics: {

        // ── KPIs ────────────────────────────────────────────
        totalApproved:        Math.round(totalApproved),
        totalBilled:          Math.round(totalBilled),
        billedApprovedRatio,
        pmpm,
        pmpy,
        trendPct,
        numMonths,
        members,
        totalClaims,
        claimsPerMember:      parseFloat((totalClaims / members).toFixed(1)),
        latestPolicyYear,

        // ── Cost Trend Chart ────────────────────────────────
        costByPolicyYear:     byPolicyYear,
        monthlyChart: {
          labels: chartLabels,   // "Jan 2023", "Feb 2023"...
          pmpm:   chartValues,   // ₱ PMPM per month
          claims: chartCounts,   // claim count per month
        },

        // ── Claim Type ─────────────────────────────────────
        claimTypeCosts,
        claimTypeCounts,
        claimTypeChart: {
          labels: Object.keys(claimTypeCounts),
          counts: Object.values(claimTypeCounts),
          costs:  Object.values(claimTypeCosts).map(Math.round),
        },

        // ── Top 5 / Top 10 Diagnosis ───────────────────────
        top5Diagnoses,
        top10DiagnosesChart,
        diagnosisChart: {
          labels: top10DiagnosesChart.map(d => d.name),
          costs:  top10DiagnosesChart.map(d => d.cost),
          counts: top10DiagnosesChart.map(d => d.count),
        },

        // ── High-Cost Claimants ─────────────────────────────
        mbl,
        highCostMembers,
        highCostPct,
        topMemberCost:    Math.round(topMemberCost),
        avgMemberCost,
        memberCostBands,
        memberCostChart: {
          labels: Object.keys(memberCostBands),
          counts: Object.values(memberCostBands),
        },

        // ── Census / Demographics ───────────────────────────
        avgAge,
        ageGroups:          buildAgeGroups(rows),
        ageGroupChart: {
          labels: Object.keys(buildAgeGroups(rows)),
          counts: Object.values(buildAgeGroups(rows)),
        },
        genderCounts,
        malePct,
        femalePct,
        genderChart: {
          labels: Object.keys(genderCounts),
          counts: Object.values(genderCounts),
        },
        relCounts,
        employeeCount,
        dependentCount,
        dependentRatio,
        civilStatusCounts,
        planLevelCounts,
        planLevelCosts,
        planLevelPmpm,
        planLevelChart: {
          labels: Object.keys(planLevelCosts),
          costs:  Object.values(planLevelCosts).map(Math.round),
          counts: Object.keys(planLevelCounts).map(k => planLevelCounts[k]),
          pmpm:   Object.keys(planLevelPmpm).map(k => planLevelPmpm[k]),
        },
        category,
        memberType,
        branches,

        // ── Utilisation ─────────────────────────────────────
        facilityTypeCounts,
        facilityCosts,
        facilityChart: {
          labels: Object.keys(facilityTypeCounts),
          counts: Object.values(facilityTypeCounts),
          costs:  Object.keys(facilityCosts).map(k => Math.round(facilityCosts[k])),
        },
        fundCounts,
        fundCosts,
        chronicClaims,
        chronicPct,

        // ── Plan Performance ─────────────────────────────────
        quarterCosts,
        quarterCounts,
        quarterChart: {
          labels: Object.keys(quarterCosts).sort(),
          costs:  Object.keys(quarterCosts).sort().map(k => Math.round(quarterCosts[k])),
          counts: Object.keys(quarterCounts).sort().map(k => quarterCounts[k]),
        },
      },
    });
  }

  // Sort by total approved cost descending
  clients.sort((a, b) => b.totalCost - a.totalCost);
  return clients;
}

module.exports = {
  normalizeRow,
  isClaimsLevelData,
  aggregateClaimsToClients,
  buildAgeGroups,
  monthSortKey,
};
