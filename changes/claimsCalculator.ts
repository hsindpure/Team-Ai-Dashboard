// @ts-nocheck
/**
 * claimsCalculator.ts -- HMO Claims Analytics Engine  v3.1
 * ──────────────────────────────────────────────────────────
 * Aggregates raw claim rows into per-client analytics objects.
 * ALL math delegated to hmoFormulas.ts
 */

const {
  BOB,
  calcPmpm, calcPmpy, calcTrendPct,
  calcIpPer1000, calcErPer1000, calcIpCostPerAdmission,
  calcThreeYearProjection,
  scoreTrendSeverity, scoreUtilisation, scorePopRisk, scoreCostEfficiency,
  calcCompositeScore, compositeToStatus, resolveClientStatus,
  calcHighCostMembers, calcTopPctSpend, assignMemberRiskTier,
  calcBilledApprovedRatio, calcDependentRatio,
} = require('./hmoFormulas');

// ── KEY NORMALIZER ───────────────────────────────────────────────
const KEY_MAP = {
  "policy_year":"policy_year","policyyear":"policy_year","year":"policy_year",
  "month":"month","month_name":"month_name","monthname":"month_name",
  "month_year":"month_year","monthyear":"month_year",
  "new_quarter":"quarter","newquarter":"quarter","quarter":"quarter",
  "fund":"fund","insurer":"fund",
  "final_claim_type":"claim_type","finalclaimtype":"claim_type",
  "claim_type":"claim_type","claimtype":"claim_type",
  "claim_type__group_":"claim_type","claim_type_group":"claim_type",
  "claim_definition":"claim_type","claim_type_1":"claim_type",
  "claim_type_level_2":"claim_type_level2",
  "member_type":"member_type","membertype":"member_type","provider_category":"member_type",
  "relationship":"relationship","relationship__group_":"relationship",
  "relationship_1":"relationship","relationship_group":"relationship",
  "icd_code2":"icd_code","icdcode2":"icd_code","icd_code":"icd_code","icd_9":"icd_code",
  "illness":"illness","diagnosis_major":"illness",
  "illness_group":"illness_group","illnessgroup":"illness_group",
  "grouped_diagnosis_updated_":"illness_group","grouped_diagnosis_updated":"illness_group",
  "grouped_diagnosis":"illness_group",
  "facility":"facility","provider_name":"facility","providers__hospitals_":"facility",
  "providers_hospitals":"facility",
  "type_of_facility":"facility_type","typeoffacility":"facility_type",
  "facility_type":"facility_type","provider_type":"facility_type",
  "case_tag":"case_tag","casetag":"case_tag",
  "case_count":"case_count","casecount":"case_count",
  "claim_no":"claim_no","claimno":"claim_no","claim_id":"claim_no",
  "plan_level":"plan_level","planlevel":"plan_level",
  "plan_description":"plan_description","plandescription":"plan_description",
  "plan":"plan_level",
  "plan_end_date":"plan_end_date","plan_start_date":"plan_start_date",
  "policy_number":"policy_number",
  "age":"age","age_group":"age_group","agegroup":"age_group",
  "age_band":"age_group","age_band__group_":"age_group","age_group_1":"age_group",
  "year_of_birth":"year_of_birth","yearofbirth":"year_of_birth",
  "gender":"gender","gender__group_":"gender","gender_group":"gender",
  "civil_status":"civil_status","civilstatus":"civil_status","fili_status":"civil_status",
  "civil_status_1":"civil_status",
  "billed_amount":"billed_amount","billedamount":"billed_amount",
  "submitted_claim_amount":"billed_amount",
  "covered_amount":"covered_amount","coveredamount":"covered_amount",
  "approvedamount":"approved_amount","approved_amount":"approved_amount",
  "paid_claim":"approved_amount","paid_claim_double":"approved_amount",
  "masked_employee_id":"member_id","maskedemployeeid":"member_id",
  "masked_member_id":"member_id","maskedmemberid":"member_id",
  "masked memner id":"member_id","masked_memner_id":"member_id","maskedmemnerid":"member_id",
  "member_id":"member_id","employee_id":"member_id",
  "employee_masked_id":"member_id","maskedmemberid_icd":"member_icd_tag",
  "entity":"entity","organization":"entity","company":"entity",
  "account":"entity","client_name_updated_":"entity","client_name":"entity",
  "client_id":"entity","entity_name":"entity","entity_code":"entity_code",
  "branch":"branch","provider_location":"branch",
  "category":"category","industry1":"category","industry__group_":"category",
  "industry":"category","industry_group":"category",
  "status":"status","claim_status":"status","claim_status_1":"status",
  "reject_claim_category":"reject_category","rejection_reasons":"rejection_reasons",
  "mbl":"mbl","max_benefit_limit":"mbl","filename":"filename",
  "admission_date":"admission_date","discharge_date":"discharge_date",
  "claim_payment_date":"claim_payment_date","file_date":"file_date",
  "members_effective_date":"members_effective_date",
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
  const yr   = String(row.month_year || row.policy_year || "2022").slice(0, 4);
  const mn   = MONTH_NUM[name] || String(row.month || "01").padStart(2, "0");
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
  const n = Number(String(val).replace(/[₱$,%\s]/g,"").replace(/,/g,""));
  return isNaN(n) ? 0 : n;
}

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

const IP_KEYWORDS = ["inpatient","in-patient","in patient","hospital","ward","admission","confinement"];
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

// ── MAIN AGGREGATOR ──────────────────────────────────────────────
function aggregateClaimsToClients(rawClaimRows, prevClientStatuses = {}) {
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

    // 1. TOTALS
    const totalClaims   = rows.length;
    const totalApproved = rows.reduce((s,r) => s + num(r.approved_amount || r.covered_amount), 0);
    const totalBilled   = rows.reduce((s,r) => s + num(r.billed_amount), 0);

    // 2. UNIQUE MEMBERS (Masked_Member_ID / Employee_ID)
    const memberIdSet = new Set(rows.map(r => String(r.member_id||"").trim()).filter(Boolean));
    const members = memberIdSet.size || Math.ceil(totalClaims / 4.2) || 1;

    // 3. MONTHS
    const monthKeys = new Set(rows.map(r => monthSortKey(r)).filter(k => k && k !== "-"));
    const numMonths = Math.max(monthKeys.size, 1);

    // 4. PMPM / PMPY
    // PMPM = Total Paid Claim / Total Headcount / Num Months
    const pmpm = calcPmpm(totalApproved, members, numMonths);
    const pmpy = calcPmpy(pmpm);

    // 5. YoY TREND
    const byPolicyYear = {};
    rows.forEach(r => {
      const yr = String(r.policy_year || r.month_year || "").slice(0, 7);
      if (yr) byPolicyYear[yr] = (byPolicyYear[yr] || 0) + num(r.approved_amount);
    });
    const pYears = Object.keys(byPolicyYear).sort();
    const trendPct = pYears.length >= 2
      ? calcTrendPct(byPolicyYear[pYears[pYears.length-1]], byPolicyYear[pYears[pYears.length-2]])
      : 0;

    // 6. IP / ER UTILISATION
    const ipRows = rows.filter(isIpClaim);
    const erRows = rows.filter(isErClaim);
    const ipAdmissionCount  = ipRows.length;
    const erVisitCount      = erRows.length;
    const ipApprovedTotal   = ipRows.reduce((s,r) => s + num(r.approved_amount), 0);
    const ipPer1000         = calcIpPer1000(ipAdmissionCount, members);
    const erPer1000         = calcErPer1000(erVisitCount, members);
    const ipCostPerAdmission= calcIpCostPerAdmission(ipApprovedTotal, ipAdmissionCount);

    // 7. CHRONIC
    const chronicClaims = rows.filter(r =>
      CHRONIC_KEYWORDS.some(kw => String(r.illness_group||r.illness||"").toLowerCase().includes(kw))
    ).length;
    const chronicPct = totalClaims ? parseFloat((chronicClaims/totalClaims*100).toFixed(1)) : 0;

    const chronicGroupCounts = {}, chronicGroupCosts = {};
    rows.forEach(r => {
      const txt = String(r.illness_group||r.illness||r.icd_code||"").toLowerCase();
      for (const [g, kws] of Object.entries(CHRONIC_GROUP_MAP)) {
        if (kws.some(k => txt.includes(k))) {
          chronicGroupCounts[g] = (chronicGroupCounts[g]||0) + 1;
          chronicGroupCosts[g]  = (chronicGroupCosts[g] ||0) + num(r.approved_amount);
          break;
        }
      }
    });
    const chronicGroups = Object.entries(chronicGroupCounts).sort((a,b)=>b[1]-a[1])
      .map(([name,count]) => ({
        name, count, cost: Math.round(chronicGroupCosts[name]||0),
        pct: parseFloat((count/Math.max(totalClaims,1)*100).toFixed(1)),
      }));

    // 8. MEMBER COST MAP
    const memberCostMap = {}, memberChronicMap = {};
    rows.forEach(r => {
      const mid = String(r.member_id||"").trim();
      if (!mid) return;
      memberCostMap[mid] = (memberCostMap[mid]||0) + num(r.approved_amount);
      if (!memberChronicMap[mid]) {
        const txt = String(r.illness_group||r.illness||"").toLowerCase();
        memberChronicMap[mid] = CHRONIC_KEYWORDS.some(k => txt.includes(k));
      }
    });
    const allMemberCostsSorted = Object.values(memberCostMap).sort((a,b)=>b-a);
    const totalMemberCount     = allMemberCostsSorted.length || 1;
    const avgCostPerMember     = allMemberCostsSorted.reduce((s,v)=>s+v,0) / totalMemberCount;

    // 9. HIGH-COST CLAIMANTS
    const mbl             = num(rows.find(r=>r.mbl)?.mbl) || 400000;
    const highCostMembers = calcHighCostMembers(allMemberCostsSorted, mbl);
    const highCostPct     = members ? parseFloat((highCostMembers/members*100).toFixed(1)) : 0;
    const topMemberCost   = allMemberCostsSorted[0] || 0;
    const avgMemberCost   = members ? Math.round(totalApproved/members) : 0;
    const b1=Math.round(mbl*0.125),b2=Math.round(mbl*0.25),b3=Math.round(mbl*0.5),b4=mbl;
    const fb = n => `₱${n>=1000?(n/1000).toFixed(0)+'k':n}`;
    const memberCostBands = {
      [`Below ${fb(b1)}`]:          allMemberCostsSorted.filter(c=>c<b1).length,
      [`${fb(b1)}-${fb(b2)}`]:      allMemberCostsSorted.filter(c=>c>=b1&&c<b2).length,
      [`${fb(b2)}-${fb(b3)}`]:      allMemberCostsSorted.filter(c=>c>=b2&&c<b3).length,
      [`${fb(b3)}-${fb(b4)}`]:      allMemberCostsSorted.filter(c=>c>=b3&&c<b4).length,
      [`${fb(b4)}+ (MBL)`]:         allMemberCostsSorted.filter(c=>c>=b4).length,
    };
    const top5  = calcTopPctSpend(allMemberCostsSorted, totalApproved, 0.05);
    const top10 = calcTopPctSpend(allMemberCostsSorted, totalApproved, 0.10);

    // 10. RISK STRATIFICATION
    let riskCritical=0,riskHigh=0,riskMedium=0,riskLow=0;
    Object.entries(memberCostMap).forEach(([mid,cost]) => {
      const tier = assignMemberRiskTier(cost, avgCostPerMember, memberChronicMap[mid]||false);
      if      (tier==='critical') riskCritical++;
      else if (tier==='high')     riskHigh++;
      else if (tier==='medium')   riskMedium++;
      else                        riskLow++;
    });
    const highRiskPct = parseFloat(((riskCritical+riskHigh)/Math.max(totalMemberCount,1)*100).toFixed(1));
    const riskStratification = {
      critical:{ count:riskCritical, pct:parseFloat((riskCritical/totalMemberCount*100).toFixed(1)) },
      high:    { count:riskHigh,     pct:parseFloat((riskHigh    /totalMemberCount*100).toFixed(1)) },
      medium:  { count:riskMedium,   pct:parseFloat((riskMedium  /totalMemberCount*100).toFixed(1)) },
      low:     { count:riskLow,      pct:parseFloat((riskLow     /totalMemberCount*100).toFixed(1)) },
    };

    // 11. COMPOSITE SCORE (Trend 35% + Util 30% + PopRisk 20% + CostEff 15%)
    const trendScore     = scoreTrendSeverity(trendPct);
    const utilScore      = scoreUtilisation(ipPer1000, erPer1000);
    const popRiskScore   = scorePopRisk(highRiskPct, chronicPct);
    const costEffScore   = scoreCostEfficiency(ipCostPerAdmission);
    const compositeScore = calcCompositeScore(trendScore, utilScore, popRiskScore, costEffScore);

    const clientId   = entityName.toLowerCase()
      .replace(/[^a-z0-9]/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"").slice(0,40);
    const rawStatus  = compositeToStatus(compositeScore);
    const prevStatus = prevClientStatuses[clientId] || null;
    const clientStatus = resolveClientStatus(rawStatus, prevStatus);

    // Legacy 0-100 riskScore alias
    const riskScore = Math.min(100, Math.round(compositeScore * 33.33));

    // 12. 3-YEAR PROJECTION
    const threeYearProjection = calcThreeYearProjection(pmpy, trendPct, members);

    // 13. DEMOGRAPHICS
    const ages   = rows.map(r=>num(r.age)).filter(a=>a>0&&a<100);
    const avgAge = ages.length ? Math.round(ages.reduce((s,a)=>s+a,0)/ages.length) : 0;
    const genderCounts = {};
    rows.forEach(r => { const g=String(r.gender||"Unknown").trim(); genderCounts[g]=(genderCounts[g]||0)+1; });
    const maleCount   = Object.entries(genderCounts).filter(([k])=>/^m(ale)?$/i.test(k)).reduce((s,[,v])=>s+v,0);
    const femaleCount = Object.entries(genderCounts).filter(([k])=>/^f(emale)?$/i.test(k)).reduce((s,[,v])=>s+v,0);
    const malePct     = totalClaims ? parseFloat((maleCount/totalClaims*100).toFixed(1)) : 0;
    const femalePct   = totalClaims ? parseFloat((femaleCount/totalClaims*100).toFixed(1)) : 0;
    const relCounts   = {};
    rows.forEach(r => { const rel=String(r.relationship||"Employee").trim(); relCounts[rel]=(relCounts[rel]||0)+1; });
    const employeeCount  = Object.entries(relCounts).filter(([k])=>/^employee/i.test(k)).reduce((s,[,v])=>s+v,0);
    const dependentCount = Object.entries(relCounts).filter(([k])=>!/^employee/i.test(k)).reduce((s,[,v])=>s+v,0);
    const dependentRatio = calcDependentRatio(employeeCount, dependentCount);
    const civilStatusCounts = {};
    rows.forEach(r => { const cs=String(r.civil_status||"Unknown").trim(); civilStatusCounts[cs]=(civilStatusCounts[cs]||0)+1; });

    // 14. PLAN LEVELS
    const planLevelCounts={},planLevelCosts={};
    rows.forEach(r => {
      const pl=String(r.plan_level||"Unknown").trim();
      planLevelCounts[pl]=(planLevelCounts[pl]||0)+1;
      planLevelCosts[pl] =(planLevelCosts[pl] ||0)+num(r.approved_amount);
    });
    const planLevelPmpm={};
    Object.entries(planLevelCosts).forEach(([p,c]) => {
      planLevelPmpm[p]=Math.round(c/(planLevelCounts[p]||1)/numMonths);
    });

    // 15. FUND / QUARTER / CLAIM TYPE / FACILITY
    const fundCounts={},fundCosts={},quarterCosts={},quarterCounts={},
          claimTypeCosts={},claimTypeCounts={},facilityTypeCounts={},facilityCosts={};
    rows.forEach(r => {
      const f=String(r.fund||"HMO").trim();        fundCounts[f]=(fundCounts[f]||0)+1;  fundCosts[f]=(fundCosts[f]||0)+num(r.approved_amount);
      const q=String(r.quarter||"").trim();         if(q){ quarterCosts[q]=(quarterCosts[q]||0)+num(r.approved_amount); quarterCounts[q]=(quarterCounts[q]||0)+1; }
      const t=String(r.claim_type||"Other").trim(); claimTypeCosts[t]=(claimTypeCosts[t]||0)+num(r.approved_amount); claimTypeCounts[t]=(claimTypeCounts[t]||0)+1;
      const ft=String(r.facility_type||"Other").trim(); facilityTypeCounts[ft]=(facilityTypeCounts[ft]||0)+1; facilityCosts[ft]=(facilityCosts[ft]||0)+num(r.approved_amount);
    });

    // 16. TOP ILLNESS GROUPS
    const illnessCostMap={};
    rows.forEach(r => {
      const grp=String(r.illness_group||r.illness||r.icd_code||"Other").trim();
      if(!illnessCostMap[grp]) illnessCostMap[grp]={cost:0,count:0,illnesses:new Set()};
      illnessCostMap[grp].cost+=num(r.approved_amount);
      illnessCostMap[grp].count+=1;
      if(r.illness) illnessCostMap[grp].illnesses.add(String(r.illness).trim());
    });
    const top5Diagnoses = Object.entries(illnessCostMap).sort((a,b)=>b[1].cost-a[1].cost).slice(0,5)
      .map(([name,d])=>({ name,cost:Math.round(d.cost),count:d.count,pct:parseFloat((d.count/totalClaims*100).toFixed(1)),topIllness:[...d.illnesses][0]||name }));
    const top10DiagnosesChart = Object.entries(illnessCostMap).sort((a,b)=>b[1].cost-a[1].cost).slice(0,10)
      .map(([name,d])=>({ name,cost:Math.round(d.cost),count:d.count }));

    // 17. MONTHLY CHART
    const monthlyMap={};
    rows.forEach(r => {
      const key=monthSortKey(r);
      if(!key||key==="-") return;
      if(!monthlyMap[key]) monthlyMap[key]={total:0,label:"",count:0};
      monthlyMap[key].total+=num(r.approved_amount); monthlyMap[key].count+=1;
      monthlyMap[key].label=`${r.month_name||""} ${r.month_year||""}`.trim()||key;
    });
    const sortedMonths=Object.keys(monthlyMap).sort().slice(-18);
    const chartLabels=sortedMonths.map(k=>monthlyMap[k].label);
    const chartValues=sortedMonths.map(k=>Math.round(monthlyMap[k].total/members));
    const chartCounts=sortedMonths.map(k=>monthlyMap[k].count);

    // 18. MISC
    const billedApprovedRatio=calcBilledApprovedRatio(totalApproved,totalBilled);
    const claimsPerMember=parseFloat((totalClaims/Math.max(members,1)).toFixed(1));
    const latestPolicyYear=pYears[pYears.length-1]||"";
    const branches=[...new Set(rows.map(r=>r.branch).filter(Boolean))];
    const category=String(rows.find(r=>r.category)?.category||"Staff").trim();
    const memberType=String(rows.find(r=>r.member_type)?.member_type||"Employees").trim();

    clients.push({
      id:clientId, name:entityName,
      members, pmpy, pmpm, trendPct, chronicPct,
      riskScore,        // legacy 0-100
      compositeScore,   // primary 0.0-3.0
      clientStatus,     // Stable | Drifting | Accelerating | Improving
      totalCost:Math.round(totalApproved), totalBilled:Math.round(totalBilled),
      totalClaims, avgAge,
      industry:"HMO / Corporate Health", country:"Philippines", currency:"₱",
      meetingDate:"", manager:"", renewalDate:"", renewalOverdue:false,
      compositeBreakdown:{ trendScore, utilScore, popRiskScore, costEffScore },
      threeYearProjection,
      analytics:{
        totalApproved:Math.round(totalApproved), totalBilled:Math.round(totalBilled),
        billedApprovedRatio, pmpm, pmpy, trendPct, numMonths, members, totalClaims,
        claimsPerMember, latestPolicyYear, costByPolicyYear:byPolicyYear,
        compositeScore, clientStatus,
        compositeBreakdown:{ trendScore, utilScore, popRiskScore, costEffScore },
        bobBenchmarks:{...BOB},
        ipPer1000, erPer1000, ipCostPerAdmission, ipAdmissionCount, erVisitCount,
        mbl, highCostMembers, highCostPct,
        topMemberCost:Math.round(topMemberCost), avgMemberCost, memberCostBands,
        top5SpendPct:top5.spendPct, top10SpendPct:top10.spendPct, top5PctCount:top5.count,
        memberCostChart:{ labels:Object.keys(memberCostBands), counts:Object.values(memberCostBands) },
        highRiskPct, riskStratification,
        chronicClaims, chronicPct, chronicGroups,
        avgAge, ageGroups:buildAgeGroups(rows),
        ageGroupChart:{ labels:Object.keys(buildAgeGroups(rows)), counts:Object.values(buildAgeGroups(rows)) },
        genderCounts, malePct, femalePct,
        genderChart:{ labels:Object.keys(genderCounts), counts:Object.values(genderCounts) },
        relCounts, employeeCount, dependentCount, dependentRatio, civilStatusCounts,
        planLevelCounts, planLevelCosts, planLevelPmpm,
        planLevelChart:{ labels:Object.keys(planLevelCosts), costs:Object.values(planLevelCosts).map(Math.round), counts:Object.keys(planLevelCounts).map(k=>planLevelCounts[k]), pmpm:Object.keys(planLevelPmpm).map(k=>planLevelPmpm[k]) },
        claimTypeCosts, claimTypeCounts,
        claimTypeChart:{ labels:Object.keys(claimTypeCounts), counts:Object.values(claimTypeCounts), costs:Object.values(claimTypeCosts).map(Math.round) },
        facilityTypeCounts, facilityCosts,
        facilityChart:{ labels:Object.keys(facilityTypeCounts), counts:Object.values(facilityTypeCounts), costs:Object.keys(facilityCosts).map(k=>Math.round(facilityCosts[k])) },
        top5Diagnoses, top10DiagnosesChart,
        diagnosisChart:{ labels:top10DiagnosesChart.map(d=>d.name), costs:top10DiagnosesChart.map(d=>d.cost), counts:top10DiagnosesChart.map(d=>d.count) },
        fundCounts, fundCosts, quarterCosts, quarterCounts,
        quarterChart:{ labels:Object.keys(quarterCosts).sort(), costs:Object.keys(quarterCosts).sort().map(k=>Math.round(quarterCosts[k])), counts:Object.keys(quarterCounts).sort().map(k=>quarterCounts[k]) },
        monthlyChart:{ labels:chartLabels, pmpm:chartValues, count:chartCounts },
        category, memberType, branches,
        threeYearProjection,
      },
    });
  }

  clients.sort((a,b) => b.totalCost - a.totalCost);
  return clients;
}

module.exports = { normalizeRow, isClaimsLevelData, aggregateClaimsToClients, buildAgeGroups, monthSortKey };
