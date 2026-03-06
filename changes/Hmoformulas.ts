 // @ts-nocheck
/**
 * hmoFormulas.ts -- HMO Mathematical Formulas Utility
 * ─────────────────────────────────────────────────────
 * Pure math functions only. No data parsing, no side effects.
 * All inputs are plain numbers. All outputs are plain numbers.
 *
 * Used by: claimsCalculator.ts
 *
 * BOB (Book of Business) benchmarks -- Marsh Philippines HMO defaults.
 * Override via environment variables if needed.
 */

// ── BOB BENCHMARKS ───────────────────────────────────────────────
const BOB = {
  TREND_PCT:       parseFloat(process.env.BOB_TREND_PCT        || '7.2'),   // % YoY PMPY growth
  IP_PER_1000:     parseFloat(process.env.BOB_IP_PER_1000      || '62'),    // IP admissions per 1,000 members
  ER_PER_1000:     parseFloat(process.env.BOB_ER_PER_1000      || '186'),   // ER visits per 1,000 members
  IP_COST_ADMIT:   parseFloat(process.env.BOB_IP_COST_ADMIT    || '28400'), // IP cost per admission (₱)
  HIGH_RISK_PCT:   parseFloat(process.env.BOB_HIGH_RISK_PCT    || '20'),    // % high-risk members
  CHRONIC_PCT:     parseFloat(process.env.BOB_CHRONIC_PCT      || '18'),    // % chronic prevalence
};

// ── CORE FINANCIAL FORMULAS ──────────────────────────────────────

/**
 * PMPM = Total Paid Claims / Total Headcount / Number of Months
 * Source: column "Paid_Claim" (approved_amount), unique member IDs, distinct months
 */
function calcPmpm(totalPaidClaims, totalHeadcount, numMonths) {
  const h = Math.max(totalHeadcount, 1);
  const m = Math.max(numMonths, 1);
  return Math.round(totalPaidClaims / h / m);
}

/**
 * PMPY = PMPM × 12
 */
function calcPmpy(pmpm) {
  return pmpm * 12;
}

/**
 * YoY Cost Trend % = (Current Year Total - Prior Year Total) / Prior Year Total × 100
 */
function calcTrendPct(currentYearTotal, priorYearTotal) {
  if (!priorYearTotal || priorYearTotal === 0) return 0;
  return parseFloat(((currentYearTotal - priorYearTotal) / priorYearTotal * 100).toFixed(1));
}

/**
 * IP per 1,000 = (IP Admission Count / Total Members) × 1,000
 * IP claims = facility_type keywords: inpatient, hospital, admission, ward
 */
function calcIpPer1000(ipAdmissionCount, totalMembers) {
  if (!totalMembers) return 0;
  return parseFloat(((ipAdmissionCount / totalMembers) * 1000).toFixed(1));
}

/**
 * ER per 1,000 = (ER Visit Count / Total Members) × 1,000
 * ER claims = facility_type keywords: emergency, er, accident, casualty
 */
function calcErPer1000(erVisitCount, totalMembers) {
  if (!totalMembers) return 0;
  return parseFloat(((erVisitCount / totalMembers) * 1000).toFixed(1));
}

/**
 * IP Cost per Admission = Total IP Approved Amount / IP Admission Count
 */
function calcIpCostPerAdmission(totalIpApproved, ipAdmissionCount) {
  if (!ipAdmissionCount) return 0;
  return Math.round(totalIpApproved / ipAdmissionCount);
}

/**
 * 3-Year No-Action Projection (compound annual growth)
 * projectedPmpy = currentPmpy × (1 + trendPct/100)^3
 */
function calcThreeYearProjection(currentPmpy, trendPct, totalMembers) {
  if (currentPmpy <= 0 || trendPct <= 0) {
    return { pmpy: 0, pct: 0, totalCost: 0, hasProjection: false };
  }
  const projected   = Math.round(currentPmpy * Math.pow(1 + trendPct / 100, 3));
  const growthPct   = parseFloat(((projected - currentPmpy) / currentPmpy * 100).toFixed(1));
  const totalCost   = Math.round(projected * totalMembers);
  return { pmpy: projected, pct: growthPct, totalCost, hasProjection: true };
}

// ── COMPOSITE SCORE DIMENSION SCORERS (0-3 scale) ────────────────

/**
 * TREND SEVERITY SCORE (Weight: 35%)
 * Metric: PMPY trend % vs prior year, benchmarked against BOB avg (7.2%)
 *
 * Score 0 → trend ≤ BOB avg (≤7.2%)
 * Score 1 → trend 1-3 pts above BOB (7.3% – 10.2%)
 * Score 2 → trend 3-5 pts above BOB (10.3% – 12.2%)
 * Score 3 → trend >5 pts above BOB (>12.2%)
 */
function scoreTrendSeverity(trendPct) {
  const diff = trendPct - BOB.TREND_PCT;
  if (diff <= 0)   return 0;
  if (diff <= 3)   return 1;
  if (diff <= 5)   return 2;
  return 3;
}

/**
 * UTILISATION GAP SCORE (Weight: 30%)
 * Metric: IP/1,000 + ER/1,000 vs BOB benchmarks (62 / 186)
 *
 * Score 0 → both at or below BOB
 * Score 1 → one metric 10-25% above BOB
 * Score 2 → one metric >25% above BOB, OR both elevated (10-25%)
 * Score 3 → both metrics >25% above BOB
 */
function scoreUtilisation(ipPer1000, erPer1000) {
  const ipGapPct = BOB.IP_PER_1000 > 0
    ? (ipPer1000 - BOB.IP_PER_1000) / BOB.IP_PER_1000 * 100 : 0;
  const erGapPct = BOB.ER_PER_1000 > 0
    ? (erPer1000 - BOB.ER_PER_1000) / BOB.ER_PER_1000 * 100 : 0;

  const ipHigh   = ipGapPct > 25;
  const erHigh   = erGapPct > 25;
  const ipMid    = ipGapPct >= 10 && ipGapPct <= 25;
  const erMid    = erGapPct >= 10 && erGapPct <= 25;

  if (ipHigh && erHigh)          return 3;
  if (ipHigh || erHigh)          return 2;
  if (ipMid  && erMid)           return 2;
  if (ipMid  || erMid)           return 1;
  return 0;
}

/**
 * POPULATION RISK SCORE (Weight: 20%)
 * Metric: % high-risk members + chronic disease prevalence vs BOB (20% / 18%)
 *
 * Score 0 → both ≤ BOB
 * Score 1 → one above BOB
 * Score 2 → both above BOB
 * Score 3 → both materially above BOB (>5 pts each)
 */
function scorePopRisk(highRiskPct, chronicPct) {
  const highRiskAbove = highRiskPct > BOB.HIGH_RISK_PCT;
  const chronicAbove  = chronicPct  > BOB.CHRONIC_PCT;
  const highRiskMat   = (highRiskPct - BOB.HIGH_RISK_PCT) > 5;
  const chronicMat    = (chronicPct  - BOB.CHRONIC_PCT)   > 5;

  if (highRiskAbove && chronicAbove && highRiskMat && chronicMat) return 3;
  if (highRiskAbove && chronicAbove)                              return 2;
  if (highRiskAbove || chronicAbove)                              return 1;
  return 0;
}

/**
 * COST EFFICIENCY SCORE (Weight: 15%)
 * Metric: IP cost per admission vs BOB benchmark (₱28,400)
 *
 * Score 0 → ≤ BOB
 * Score 1 → 1-15% above BOB
 * Score 2 → 15-30% above BOB
 * Score 3 → >30% above BOB
 */
function scoreCostEfficiency(ipCostPerAdmission) {
  if (!BOB.IP_COST_ADMIT || BOB.IP_COST_ADMIT === 0) return 0;
  const gapPct = (ipCostPerAdmission - BOB.IP_COST_ADMIT) / BOB.IP_COST_ADMIT * 100;
  if (gapPct <= 0)   return 0;
  if (gapPct <= 15)  return 1;
  if (gapPct <= 30)  return 2;
  return 3;
}

/**
 * WEIGHTED COMPOSITE SCORE
 * = (Trend × 0.35) + (Util × 0.30) + (PopRisk × 0.20) + (CostEff × 0.15)
 * Max = 3.0
 */
function calcCompositeScore(trendScore, utilScore, popRiskScore, costEffScore) {
  const raw = (trendScore   * 0.35) +
              (utilScore    * 0.30) +
              (popRiskScore * 0.20) +
              (costEffScore * 0.15);
  return parseFloat(Math.min(3.0, raw).toFixed(2));
}

/**
 * STATUS from composite score
 * 0.0 – 1.0 → Stable
 * 1.1 – 1.9 → Drifting
 * 2.0 – 3.0 → Accelerating
 */
function compositeToStatus(compositeScore) {
  if (compositeScore <= 1.0) return 'Stable';
  if (compositeScore <= 1.9) return 'Drifting';
  return 'Accelerating';
}

/**
 * IMPROVING detection (month-over-month)
 * A client is "Improving" if their status moved DOWN:
 *   Accelerating → Drifting
 *   Drifting     → Stable
 *
 * @param currentStatus  string - current month's computed status
 * @param prevStatus     string | null - previous month's stored status
 */
function resolveClientStatus(currentStatus, prevStatus) {
  if (!prevStatus) return currentStatus;
  const order = { 'Accelerating': 3, 'Drifting': 2, 'Stable': 1, 'Improving': 1 };
  const prev  = order[prevStatus]    || 0;
  const curr  = order[currentStatus] || 0;
  if (curr < prev) return 'Improving';
  return currentStatus;
}

// ── HIGH-COST CLAIMANT METRICS ───────────────────────────────────

/**
 * High-cost member count: members whose total spend ≥ 50% of MBL
 */
function calcHighCostMembers(memberCostArray, mbl) {
  const threshold = mbl * 0.50;
  return memberCostArray.filter(c => c >= threshold).length;
}

/**
 * Top N% spend share = top N% member spend / total spend × 100
 */
function calcTopPctSpend(sortedMemberCostsDesc, totalApproved, pct) {
  const count   = Math.max(1, Math.ceil(sortedMemberCostsDesc.length * pct));
  const topSpend = sortedMemberCostsDesc.slice(0, count).reduce((s, v) => s + v, 0);
  return {
    count,
    spendPct: totalApproved ? parseFloat((topSpend / totalApproved * 100).toFixed(1)) : 0,
  };
}

// ── RISK STRATIFICATION ──────────────────────────────────────────

/**
 * Member risk tier assignment
 * Critical : chronic + costRatio ≥ 3
 * High     : chronic OR costRatio ≥ 2
 * Medium   : costRatio ≥ 1.2
 * Low      : everything else
 */
function assignMemberRiskTier(memberCost, avgCostPerMember, isChronic) {
  const costRatio = memberCost / Math.max(avgCostPerMember, 1);
  if (isChronic && costRatio >= 3) return 'critical';
  if (isChronic || costRatio >= 2) return 'high';
  if (costRatio >= 1.2)            return 'medium';
  return 'low';
}

// ── BILLED VS APPROVED ───────────────────────────────────────────
function calcBilledApprovedRatio(totalApproved, totalBilled) {
  if (!totalBilled) return 100;
  return parseFloat((totalApproved / totalBilled * 100).toFixed(1));
}

// ── DEPENDENT RATIO ──────────────────────────────────────────────
function calcDependentRatio(employeeCount, dependentCount) {
  if (!employeeCount) return 0;
  return parseFloat((dependentCount / employeeCount).toFixed(2));
}

module.exports = {
  BOB,
  // Financial
  calcPmpm,
  calcPmpy,
  calcTrendPct,
  calcIpPer1000,
  calcErPer1000,
  calcIpCostPerAdmission,
  calcThreeYearProjection,
  // Composite score
  scoreTrendSeverity,
  scoreUtilisation,
  scorePopRisk,
  scoreCostEfficiency,
  calcCompositeScore,
  compositeToStatus,
  resolveClientStatus,
  // Member analytics
  calcHighCostMembers,
  calcTopPctSpend,
  assignMemberRiskTier,
  // Misc
  calcBilledApprovedRatio,
  calcDependentRatio,
};
