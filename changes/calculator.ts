// @ts-nocheck
/**
 * claimsCalculator.ts -- Dynamic HMO Claims Analytics Engine
 * ----------------------------------------------------------
 * v3.1 — Weighted Composite Score (per Marsh scoring framework)
 *
 * Score = (TrendSeverity×0.35) + (UtilGap×0.30) + (PopRisk×0.20) + (CostEff×0.15)
 * Each dimension scored 0–3. Max composite = 3.0.
 *
 * Status:   0.0–1.0 → Stable | 1.1–1.9 → Drifting | 2.0–3.0 → Accelerating
 * Improving → client moved down a category vs prior period (Acc→Drift or Drift→Stable)
 */

// ── KEY NORMALIZER ──────────────────────────────────────────────
const KEY_MAP = {
  // Time
  "policy_year":"policy_year","policyyear":"policy_year","policy_year":"Year",
  "month":"month","month_name":"month_name","monthname":"month_name",
  "month_year":"month_year","monthyear":"month_year",
  "new_quarter":"quarter","newquarter":"quarter","quarter":"quarter",
  // Fund
  "fund":"fund","insurer":"fund",
  // Claim type
  "final_claim_type":"claim_type","finalclaimtype":"claim_type",
  "claim_type":"claim_type","claimtype":"claim_type",
  "claim_type__group_":"claim_type","claim_type_group":"claim_type",
  "claim_definition":"claim_type",
  // Member
  "member_type":"member_type","membertype":"member_type",
  "provider_category":"member_type",
  "relationship":"relationship","relationship__group_":"relationship",
  // Diagnosis
  "icd_code2":"icd_code","icdcode2":"icd_code","icd_code":"icd_code","icd_9":"icd_code",
  "illness":"illness","diagnosis_major":"illness",
  "illness_group":"illness_group","illnessgroup":"illness_group",
  "grouped_diagnosis_updated_":"illness_group","grouped_diagnosis_updated":"illness_group",
  "grouped_diagnosis":"illness_group",
  // Facility
  "facility":"facility","provider_name":"facility","providers__hospitals_":"facility",
  "type_of_facility":"facility_type","typeoffacility":"facility_type",
  "facility_type":"facility_type","provider_type":"facility_type",
  // Case
  "case_tag":"case_tag","casetag":"case_tag",
  "case_count":"case_count","casecount":"case_count",
  "claim_no":"claim_no","claimno":"claim_no","claim_id":"claim_no",
  // Plan
  "plan_level":"plan_level","planlevel":"plan_level",
  "plan_description":"plan_description","plandescription":"plan_description",
  // Demographics
  "age":"age","age_group":"age_group","agegroup":"age_group",
  "age_band":"age_group","age_band__group_":"age_group",
  "year_of_birth":"year_of_birth","yearofbirth":"year_of_birth",
  "gender":"gender","gender__group_":"gender",
  "civil_status":"civil_status","civilstatus":"civil_status","fili_status":"civil_status",
  // Amounts
  "billed_amount":"billed_amount","billedamount":"billed_amount",
  "submitted_claim_amount":"billed_amount",
  "covered_amount":"covered_amount","coveredamount":"covered_amount",
  "approvedamount":"approved_amount","approved_amount":"approved_amount",
  "paid_claim":"approved_amount",
  // Member IDs
  "maskedmemberid + icd":"member_icd_tag",
  "masked_employee_id":"member_id","maskedemployeeid":"member_id",
  "masked_member_id":"member_id","maskedmemberid":"member_id",
  "masked memner id":"member_id","masked_memner_id":"member_id","maskedmemnerid":"member_id",
  "member_id":"member_id","employee_id":"member_id",
  // Entity
  "entity":"entity","organization":"entity","company":"entity",
  "account":"entity","client_name_updated_":"entity","client_name":"entity",
  "client_id":"entity",
  // Location
  "branch":"branch","provider_location":"branch",
  "category":"category","industry1":"category","industry__group_":"category","industry":"category",
  // Status
  "status":"status","claim_status":"status",
  "mbl":"mbl","max_benefit_limit":"mbl",
  "filename":"filename",
};

function normalizeRow(row) {
  const normalized = {};
  for (const [rawKey, val] of Object.entries(row)) {
    const lk = String(rawKey).trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g,"");
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
  const yr   = String(row.month_year || row.policy_year || "2022").slice(0, 4);
  const mn   = MONTH_NUM[name] || String(row.month || "01").padStart(2, "0");
  return `${yr}-${mn}`;
}

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

function num(val) {
  if (val === null || val === undefined) return 0;
  const n = Number(String(val).replace(/[₱$,%\s]/g, "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

// ── CHRONIC GROUPS ──────────────────────────────────────────────
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

// ── FACILITY TYPE KEYWORDS ──────────────────────────────────────
const IP_KEYWORDS = ["inpatient","in-patient","ip","admission","hospital","ward","confinement","inpatient ward"];
const ER_KEYWORDS = ["emergency","er","accident","emerg","a&e","casualty"];

// ── BOB BENCHMARKS (Marsh Philippines HMO Book of Business) ────
const BOB = {
  TREND_PCT:     7.2,   // PMPY trend vs prior year (%)
  IP_PER_1000:   62,    // Inpatient admissions per 1,000 members
  ER_PER_1000:   186,   // Emergency visits per 1,000 members
  IP_COST_ADMIT: 28400, // IP cost per admission (₱ equiv, ~$500 × FX)
  HIGH_RISK_PCT: 20,    // % high-risk members benchmark
  CHRONIC_PCT:   18,    // Chronic prevalence benchmark (diabetes ref point)
};

// ── DIMENSION SCORERS (each returns 0, 1, 2, or 3) ─────────────

/**
 * Trend Severity Score (weight 35%)
 * Measures PMPY trend vs prior year, benchmarked against BOB avg of 7.2%
 *   0 → trend ≤ 7.2% (at or below BOB)
 *   1 → trend 7.3%–10.2% (1–3 pts above BOB)
 *   2 → trend 10.3%–12.2% (3–5 pts above BOB)
 *   3 → trend > 12.2% (>5 pts above BOB)
 */
function scoreTrendSeverity(trendPct) {
  const above = trendPct - BOB.TREND_PCT;
  if (above <= 0)  return 0;
  if (above <= 3)  return 1;
  if (above <= 5)  return 2;
  return 3;
}

/**
 * Utilisation Gap Score (weight 30%)
 * Compares IP/1000 and ER/1000 to BOB benchmarks (62 / 186)
 *   0 → Both at or below BOB
 *   1 → One metric 10–25% above BOB
 *   2 → One >25% above BOB, or both elevated (both above BOB)
 *   3 → Both >25% above BOB
 */
function scoreUtilisation(ipPer1000, erPer1000) {
  const ipAbovePct = BOB.IP_PER_1000  > 0 ? (ipPer1000 - BOB.IP_PER_1000)  / BOB.IP_PER_1000  * 100 : 0;
  const erAbovePct = BOB.ER_PER_1000  > 0 ? (erPer1000 - BOB.ER_PER_1000)  / BOB.ER_PER_1000  * 100 : 0;

  const ipAbove = ipPer1000 > BOB.IP_PER_1000;
  const erAbove = erPer1000 > BOB.ER_PER_1000;
  const ipHighAbove = ipAbovePct > 25;
  const erHighAbove = erAbovePct > 25;
  const ipMidAbove  = ipAbovePct >= 10 && ipAbovePct <= 25;
  const erMidAbove  = erAbovePct >= 10 && erAbovePct <= 25;

  if (ipHighAbove && erHighAbove) return 3;
  if (ipHighAbove || erHighAbove) return 2;
  if (ipAbove && erAbove)         return 2; // both elevated
  if (ipMidAbove || erMidAbove)   return 1;
  return 0;
}

/**
 * Population Risk Score (weight 20%)
 * Compares high-risk member % and chronic prevalence to BOB benchmarks
 *   0 → Both ≤ BOB
 *   1 → One above BOB
 *   2 → Both above BOB
 *   3 → Both materially above BOB (>5 pts each)
 */
function scorePopRisk(highRiskPct, chronicPct) {
  const hrAbove  = highRiskPct > BOB.HIGH_RISK_PCT;
  const chrAbove = chronicPct  > BOB.CHRONIC_PCT;
  const hrMaterial  = (highRiskPct - BOB.HIGH_RISK_PCT) > 5;
  const chrMaterial = (chronicPct  - BOB.CHRONIC_PCT)   > 5;

  if (hrMaterial && chrMaterial) return 3;
  if (hrAbove && chrAbove)       return 2;
  if (hrAbove || chrAbove)       return 1;
  return 0;
}

/**
 * Cost Efficiency Score (weight 15%)
 * Compares IP cost per admission to BOB benchmark (₱28,400 equiv)
 *   0 → ≤ BOB
 *   1 → 1–15% above BOB
 *   2 → 15–30% above BOB
 *   3 → >30% above BOB
 */
function scoreCostEfficiency(ipCostPerAdmission) {
  if (ipCostPerAdmission <= 0) return 0; // no IP data, assume at BOB
  const abovePct = (ipCostPerAdmission - BOB.IP_COST_ADMIT) / BOB.IP_COST_ADMIT * 100;
  if (abovePct <= 0)  return 0;
  if (abovePct <= 15) return 1;
  if (abovePct <= 30) return 2;
  return 3;
}

/**
 * Weighted Composite Score — main entry point
 * Returns { compositeScore, trendScore, utilScore, popRiskScore, costEffScore }
 */
function computeCompositeScore({ trendPct, ipPer1000, erPer1000, highRiskPct, chronicPct, ipCostPerAdmission }) {
  const trendScore   = scoreTrendSeverity(trendPct);
  const utilScore    = scoreUtilisation(ipPer1000, erPer1000);
  const popRiskScore = scorePopRisk(highRiskPct, chronicPct);
  const costEffScore = scoreCostEfficiency(ipCostPerAdmission);

  const compositeScore = parseFloat((
    trendScore   * 0.35 +
    utilScore    * 0.30 +
    popRiskScore * 0.20 +
    costEffScore * 0.15
  ).toFixed(2));

  return { compositeScore, trendScore, utilScore, popRiskScore, costEffScore };
}

/**
 * Derive client status from composite score.
 * "Improving" is a special status set externally (month-over-month comparison).
 */
function compositeToStatus(compositeScore) {
  if (compositeScore >= 2.0) return "Accelerating";
  if (compositeScore >= 1.1) return "Drifting";
  return "Stable";
}

/**
 * Detect "Improving": client moved DOWN a category vs prior month.
 * Accelerating→Drifting, Drifting→Stable, or Accelerating→Stable all count.
 * prevStatus is passed in from persisted/cached prior-month data.
 */
function resolveClientStatus(compositeScore, prevStatus) {
  const currentStatus = compositeToStatus(compositeScore);
  if (!prevStatus || prevStatus === currentStatus) return currentStatus;

  const rank = { Accelerating: 3, Drifting: 2, Stable: 1, Improving: 1 };
  const prevRank = rank[prevStatus] || 0;
  const currRank = rank[currentStatus] || 0;

  // Improved = moved to a lower-severity status
  if (currRank < prevRank) return "Improving";
  return currentStatus;
}

// ── MAIN AGGREGATOR ─────────────────────────────────────────────
function aggregateClaimsToClients(rawClaimRows, prevClientStatuses = {}) {
  // prevClientStatuses: { [clientId]: 'Stable'|'Drifting'|'Accelerating' }
  // passed in from cache/DB to enable Improving detection across runs

  const claimRows = rawClaimRows.map(normalizeRow);

  const byEntity = {};
  for (const row of claimRows) {
    const entity = String(row.entity || "Unknown").trim();
    if (!entity || entity === "null" || entity === "Unknown") continue;
    if (!byEntity[entity]) byEntity[entity] = [];
    byEntity[entity].push(row);
  }

  const clients = [];

  for (const [entityName, rows] of Object.entries(byEntity)) {

    // ── 1. TOTALS ─────────────────────────────────────────────
    const totalClaims   = rows.length;
    const totalApproved = rows.reduce((s, r) => s + num(r.approved_amount || r.covered_amount), 0);
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
    const pmpm = Math.round(totalApproved / members / numMonths);
    const pmpy = pmpm * 12;

    // ── 5. YoY COST TREND ─────────────────────────────────────
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

    // ── 6. MONTHLY CHART ──────────────────────────────────────
    const monthlyMap = {};
    rows.forEach(r => {
      const key = monthSortKey(r);
      if (!key || key === "-") return;
      if (!monthlyMap[key]) monthlyMap[key] = { total: 0, label: "", count: 0 };
      monthlyMap[key].total += num(r.approved_amount);
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
      claimTypeCosts[t]  = (claimTypeCosts[t]  || 0) + num(r.approved_amount);
      claimTypeCounts[t] = (claimTypeCounts[t] || 0) + 1;
    });

    // ── 8. TOP ILLNESS GROUPS ─────────────────────────────────
    const illnessCostMap = {};
    rows.forEach(r => {
      const grp = String(r.illness_group || r.illness || r.icd_code || "Other").trim();
      if (!illnessCostMap[grp]) illnessCostMap[grp] = { cost:0, count:0, illnesses: new Set() };
      illnessCostMap[grp].cost  += num(r.approved_amount);
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
      facilityCosts[ft]      = (facilityCosts[ft]      || 0) + num(r.approved_amount);
    });

    // ── 9a. IP / ER per 1,000 MEMBERS ────────────────────────
    // Identify inpatient and emergency claims by facility type keyword matching
    let ipClaimsCount = 0, ipClaimsCost = 0;
    let erClaimsCount = 0;
    rows.forEach(r => {
      const ft = String(r.facility_type || r.claim_type || "").toLowerCase();
      if (IP_KEYWORDS.some(kw => ft.includes(kw))) {
        ipClaimsCount++;
        ipClaimsCost += num(r.approved_amount);
      } else if (ER_KEYWORDS.some(kw => ft.includes(kw))) {
        erClaimsCount++;
      }
    });
    const ipPer1000 = members > 0 ? parseFloat(((ipClaimsCount / members) * 1000).toFixed(1)) : 0;
    const erPer1000 = members > 0 ? parseFloat(((erClaimsCount / members) * 1000).toFixed(1)) : 0;
    // IP cost per admission
    const ipCostPerAdmission = ipClaimsCount > 0 ? Math.round(ipClaimsCost / ipClaimsCount) : 0;

    // ── 10. HIGH-COST CLAIMANTS ───────────────────────────────
    const memberCostMap = {};
    rows.forEach(r => {
      const mid = String(r.member_id || "").trim();
      if (!mid) return;
      memberCostMap[mid] = (memberCostMap[mid] || 0) + num(r.approved_amount);
    });
    const mbl            = num(rows.find(r => r.mbl)?.mbl) || 400000;
    const allMemberCosts = Object.values(memberCostMap).sort((a, b) => b - a);
    const highCostThresh = mbl * 0.50;
    const highCostMembers = allMemberCosts.filter(c => c >= highCostThresh).length;
    const highCostPct    = members ? parseFloat((highCostMembers / members * 100).toFixed(1)) : 0;
    const topMemberCost  = allMemberCosts[0] || 0;
    const avgMemberCost  = members ? Math.round(totalApproved / members) : 0;
    const memberCostBands = {};
    const b1 = Math.round(mbl * 0.125), b2 = Math.round(mbl * 0.25),
          b3 = Math.round(mbl * 0.5),   b4 = mbl;
    const fmt = n => `₱${n >= 1000 ? (n/1000).toFixed(0)+'k' : n}`;
    memberCostBands[`Below ${fmt(b1)}`]      = allMemberCosts.filter(c => c < b1).length;
    memberCostBands[`${fmt(b1)}-${fmt(b2)}`] = allMemberCosts.filter(c => c >= b1 && c < b2).length;
    memberCostBands[`${fmt(b2)}-${fmt(b3)}`] = allMemberCosts.filter(c => c >= b2 && c < b3).length;
    memberCostBands[`${fmt(b3)}-${fmt(b4)}`] = allMemberCosts.filter(c => c >= b3 && c < b4).length;
    memberCostBands[`${fmt(b4)}+ (MBL)`]     = allMemberCosts.filter(c => c >= b4).length;

    // ── 11. DEMOGRAPHICS ─────────────────────────────────────
    const ages   = rows.map(r => num(r.age)).filter(a => a > 0 && a < 100);
    const avgAge = ages.length ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : 0;
    const genderCounts = {};
    rows.forEach(r => {
      const g = String(r.gender || "Unknown").trim();
      genderCounts[g] = (genderCounts[g] || 0) + 1;
    });
    const maleCount   = Object.entries(genderCounts).filter(([k]) => /^m(ale)?$/i.test(k)).reduce((s,[,v])=>s+v, 0);
    const femaleCount = Object.entries(genderCounts).filter(([k]) => /^f(emale)?$/i.test(k)).reduce((s,[,v])=>s+v, 0);
    const malePct     = totalClaims ? parseFloat((maleCount   / totalClaims * 100).toFixed(1)) : 0;
    const femalePct   = totalClaims ? parseFloat((femaleCount / totalClaims * 100).toFixed(1)) : 0;
    const relCounts = {};
    rows.forEach(r => {
      const rel = String(r.relationship || "Employee").trim();
      relCounts[rel] = (relCounts[rel] || 0) + 1;
    });
    const employeeCount  = Object.entries(relCounts).filter(([k]) => /^employee/i.test(k)).reduce((s,[,v])=>s+v, 0);
    const dependentCount = Object.entries(relCounts).filter(([k]) => !/^employee/i.test(k)).reduce((s,[,v])=>s+v, 0);
    const dependentRatio = employeeCount ? parseFloat((dependentCount / employeeCount).toFixed(2)) : 0;
    const civilStatusCounts = {};
    rows.forEach(r => {
      const cs = String(r.civil_status || "Unknown").trim();
      civilStatusCounts[cs] = (civilStatusCounts[cs] || 0) + 1;
    });

    // ── 12. PLAN LEVELS ───────────────────────────────────────
    const planLevelCounts = {}, planLevelCosts = {};
    rows.forEach(r => {
      const pl = String(r.plan_level || "Unknown").trim();
      planLevelCounts[pl] = (planLevelCounts[pl] || 0) + 1;
      planLevelCosts[pl]  = (planLevelCosts[pl]  || 0) + num(r.approved_amount);
    });
    const planLevelPmpm = {};
    Object.entries(planLevelCosts).forEach(([plan, cost]) => {
      const cnt = planLevelCounts[plan] || 1;
      planLevelPmpm[plan] = Math.round(cost / cnt / numMonths);
    });

    // ── 13. FUND ──────────────────────────────────────────────
    const fundCounts = {}, fundCosts = {};
    rows.forEach(r => {
      const f = String(r.fund || "HMO").trim();
      fundCounts[f] = (fundCounts[f] || 0) + 1;
      fundCosts[f]  = (fundCosts[f]  || 0) + num(r.approved_amount);
    });

    // ── 14. QUARTERLY ─────────────────────────────────────────
    const quarterCosts = {}, quarterCounts = {};
    rows.forEach(r => {
      const q = String(r.quarter || "").trim();
      if (!q) return;
      quarterCosts[q]  = (quarterCosts[q]  || 0) + num(r.approved_amount);
      quarterCounts[q] = (quarterCounts[q] || 0) + 1;
    });

    // ── 15. CHRONIC RATE ──────────────────────────────────────
    const chronicClaims = rows.filter(r =>
      CHRONIC_KEYWORDS.some(kw =>
        String(r.illness_group || r.illness || "").toLowerCase().includes(kw)
      )
    ).length;
    const chronicPct = totalClaims ? parseFloat((chronicClaims / totalClaims * 100).toFixed(1)) : 0;

    // ── 15a. CHRONIC GROUPING ─────────────────────────────────
    const chronicGroupCounts = {};
    const chronicGroupCosts  = {};
    rows.forEach(r => {
      const txt = String(r.illness_group || r.illness || r.icd_code || "").toLowerCase();
      for (const [groupName, keywords] of Object.entries(CHRONIC_GROUP_MAP)) {
        if (keywords.some(kw => txt.includes(kw))) {
          chronicGroupCounts[groupName] = (chronicGroupCounts[groupName] || 0) + 1;
          chronicGroupCosts[groupName]  = (chronicGroupCosts[groupName]  || 0) + num(r.approved_amount);
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

    // ── 16. RISK STRATIFICATION ───────────────────────────────
    const memberRiskMap = {};
    rows.forEach(r => {
      const mid = String(r.member_id || "").trim();
      if (!mid) return;
      if (!memberRiskMap[mid]) memberRiskMap[mid] = { cost: 0, claims: 0, chronic: false };
      memberRiskMap[mid].cost   += num(r.approved_amount);
      memberRiskMap[mid].claims += 1;
      const txt = String(r.illness_group || r.illness || "").toLowerCase();
      if (CHRONIC_KEYWORDS.some(kw => txt.includes(kw))) memberRiskMap[mid].chronic = true;
    });
    const memberValues    = Object.values(memberRiskMap);
    const totalMembers    = memberValues.length || 1;
    const avgCostPerMember = memberValues.reduce((s, m) => s + m.cost, 0) / totalMembers;
    let riskCritical = 0, riskHigh = 0, riskMedium = 0, riskLow = 0;
    memberValues.forEach(m => {
      const costRatio = m.cost / Math.max(avgCostPerMember, 1);
      if      (m.chronic && costRatio >= 3) riskCritical++;
      else if (m.chronic || costRatio >= 2) riskHigh++;
      else if (costRatio >= 1.2)            riskMedium++;
      else                                  riskLow++;
    });
    const riskStratification = {
      critical: { count: riskCritical, pct: parseFloat((riskCritical / totalMembers * 100).toFixed(1)) },
      high:     { count: riskHigh,     pct: parseFloat((riskHigh     / totalMembers * 100).toFixed(1)) },
      medium:   { count: riskMedium,   pct: parseFloat((riskMedium   / totalMembers * 100).toFixed(1)) },
      low:      { count: riskLow,      pct: parseFloat((riskLow      / totalMembers * 100).toFixed(1)) },
    };

    // ── 17. HIGH-COST SPEND CONCENTRATION ────────────────────
    const allMemberCostsSorted = Object.values(memberRiskMap).map(m => m.cost).sort((a, b) => b - a);
    const top5PctCount  = Math.max(1, Math.ceil(allMemberCostsSorted.length * 0.05));
    const top5PctSpend  = allMemberCostsSorted.slice(0, top5PctCount).reduce((s, v) => s + v, 0);
    const top5SpendPct  = totalApproved ? parseFloat((top5PctSpend / totalApproved * 100).toFixed(1)) : 0;
    const top10PctCount = Math.max(1, Math.ceil(allMemberCostsSorted.length * 0.10));
    const top10PctSpend = allMemberCostsSorted.slice(0, top10PctCount).reduce((s, v) => s + v, 0);
    const top10SpendPct = totalApproved ? parseFloat((top10PctSpend / totalApproved * 100).toFixed(1)) : 0;

    // ── 18. BILLED vs APPROVED ────────────────────────────────
    const billedApprovedRatio = totalBilled
      ? parseFloat((totalApproved / totalBilled * 100).toFixed(1)) : 100;

    // ── 19. COMPOSITE SCORE (replaces old 0–100 riskScore) ────
    const highRiskPct = riskStratification.critical.pct + riskStratification.high.pct;

    const { compositeScore, trendScore, utilScore, popRiskScore, costEffScore } =
      computeCompositeScore({ trendPct, ipPer1000, erPer1000, highRiskPct, chronicPct, ipCostPerAdmission });

    // riskScore kept for backward compatibility (0–100 mapped from 0–3 scale)
    const riskScore = Math.min(100, Math.round(compositeScore * 33.33));

    // ── 20. CLIENT STATUS ─────────────────────────────────────
    const clientId = entityName.toLowerCase()
      .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_")
      .replace(/^_|_$/g, "").slice(0, 40);

    const prevStatus   = prevClientStatuses[clientId] || null;
    const clientStatus = resolveClientStatus(compositeScore, prevStatus);

    // ── 21. META ──────────────────────────────────────────────
    const latestPolicyYear = pYears[pYears.length - 1] || "";
    const branches   = [...new Set(rows.map(r => r.branch).filter(Boolean))];
    const category   = String(rows.find(r => r.category)?.category || "Staff").trim();
    const memberType = String(rows.find(r => r.member_type)?.member_type || "Employees").trim();
    const claimsPerMember = totalClaims / Math.max(members, 1);

    clients.push({
      id: clientId, name: entityName,
      members, pmpy, pmpm, trendPct, chronicPct, riskScore,
      // ── New composite fields ──
      compositeScore,
      clientStatus,
      compositeBreakdown: { trendScore, utilScore, popRiskScore, costEffScore },
      // ─────────────────────────
      totalCost: Math.round(totalApproved),
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
        monthlyChart: { labels: chartLabels, pmpm: chartValues, count: chartCounts },
        claimTypeCosts, claimTypeCounts,
        claimTypeChart: {
          labels: Object.keys(claimTypeCounts),
          counts: Object.values(claimTypeCounts),
          costs:  Object.values(claimTypeCosts).map(Math.round),
        },
        top5Diagnoses, top10DiagnosesChart,
        diagnosisChart: {
          labels: top10DiagnosesChart.map(d => d.name),
          costs:  top10DiagnosesChart.map(d => d.cost),
          counts: top10DiagnosesChart.map(d => d.count),
        },
        mbl, highCostMembers, highCostPct,
        topMemberCost: Math.round(topMemberCost),
        avgMemberCost, memberCostBands,
        memberCostChart: {
          labels: Object.keys(memberCostBands),
          counts: Object.values(memberCostBands),
        },
        avgAge, ageGroups: buildAgeGroups(rows),
        ageGroupChart: {
          labels: Object.keys(buildAgeGroups(rows)),
          counts: Object.values(buildAgeGroups(rows)),
        },
        genderCounts, malePct, femalePct,
        genderChart: { labels: Object.keys(genderCounts), counts: Object.values(genderCounts) },
        relCounts, employeeCount, dependentCount, dependentRatio,
        civilStatusCounts, planLevelCounts, planLevelCosts, planLevelPmpm,
        planLevelChart: {
          labels: Object.keys(planLevelCosts),
          costs:  Object.values(planLevelCosts).map(Math.round),
          counts: Object.keys(planLevelCounts).map(k => planLevelCounts[k]),
          pmpm:   Object.keys(planLevelPmpm).map(k => planLevelPmpm[k]),
        },
        category, memberType, branches,
        facilityTypeCounts, facilityCosts,
        facilityChart: {
          labels: Object.keys(facilityTypeCounts),
          counts: Object.values(facilityTypeCounts),
          costs:  Object.keys(facilityCosts).map(k => Math.round(facilityCosts[k])),
        },
        fundCounts, fundCosts, chronicClaims, chronicPct,
        quarterCosts, quarterCounts,
        quarterChart: {
          labels: Object.keys(quarterCosts).sort(),
          costs:  Object.keys(quarterCosts).sort().map(k => Math.round(quarterCosts[k])),
          counts: Object.keys(quarterCounts).sort().map(k => quarterCounts[k]),
        },
        chronicGroups, riskStratification,
        top5SpendPct, top10SpendPct, top5PctCount,
        // ── New utilisation fields ──
        ipPer1000, erPer1000, ipCostPerAdmission,
        ipClaimsCount, erClaimsCount,
        // ── Composite score detail ──
        compositeScore,
        compositeBreakdown: { trendScore, utilScore, popRiskScore, costEffScore },
        clientStatus,
        bobBenchmarks: {
          trendPct:       BOB.TREND_PCT,
          ipPer1000:      BOB.IP_PER_1000,
          erPer1000:      BOB.ER_PER_1000,
          ipCostPerAdmit: BOB.IP_COST_ADMIT,
          highRiskPct:    BOB.HIGH_RISK_PCT,
          chronicPct:     BOB.CHRONIC_PCT,
        },
      },
    });
  }

  clients.sort((a, b) => b.totalCost - a.totalCost);
  return clients;
}

module.exports = {
  normalizeRow, isClaimsLevelData, aggregateClaimsToClients,
  buildAgeGroups, monthSortKey,
  // Export scoring functions for unit testing
  scoreTrendSeverity, scoreUtilisation, scorePopRisk, scoreCostEfficiency,
  computeCompositeScore, compositeToStatus, resolveClientStatus,
  BOB,
};
