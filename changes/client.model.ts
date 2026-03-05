// ClaimsIQ Client Models -- v3.1 Composite Score Framework

export interface RiskColor {
  bg: string;
  border: string;
  badge: string;
  label: 'Stable' | 'Improving' | 'Drifting' | 'Accelerating';
  glow: string;
}

export type ClientStatus = 'Stable' | 'Improving' | 'Drifting' | 'Accelerating';

export interface CompositeBreakdown {
  trendScore:    0 | 1 | 2 | 3;  // Trend Severity (weight 35%)
  utilScore:     0 | 1 | 2 | 3;  // Utilisation Gap (weight 30%)
  popRiskScore:  0 | 1 | 2 | 3;  // Population Risk (weight 20%)
  costEffScore:  0 | 1 | 2 | 3;  // Cost Efficiency (weight 15%)
}

export interface BobBenchmarks {
  trendPct:       number;  // 7.2%
  ipPer1000:      number;  // 62
  erPer1000:      number;  // 186
  ipCostPerAdmit: number;  // 28400
  highRiskPct:    number;  // 20%
  chronicPct:     number;  // 18%
}

export interface DiagnosisEntry {
  name: string;
  count: number;
  pct: number;
  cost?: number;
  topIllness?: string;
}

export interface Analytics {
  // Core financials
  totalApproved: number;
  totalBilled?: number;
  totalClaims: number;
  pmpm: number;
  pmpy: number;
  numMonths?: number;
  avgAge: number;
  trendPct: number;
  billedApprovedRatio?: number;
  latestPolicyYear?: string;
  claimsPerMember?: number;

  // ── Composite Score (Marsh Framework) ─────────────────────
  compositeScore?:    number;          // 0.0 – 3.0
  compositeBreakdown?: CompositeBreakdown;
  clientStatus?:      ClientStatus;
  bobBenchmarks?:     BobBenchmarks;

  // ── Utilisation metrics (for composite scoring) ────────────
  ipPer1000?:          number;  // Inpatient admissions per 1,000 members
  erPer1000?:          number;  // ER visits per 1,000 members
  ipCostPerAdmission?: number;  // Average IP cost per admission
  ipClaimsCount?:      number;
  erClaimsCount?:      number;

  // Chronic / risk
  chronicPct?: number;
  chronicClaims?: number;

  // Chronic condition groups
  chronicGroups?: {
    name: string;
    count: number;
    cost: number;
    pct: number;
  }[];

  // Risk stratification tiers
  riskStratification?: {
    critical: { count: number; pct: number };
    high:     { count: number; pct: number };
    medium:   { count: number; pct: number };
    low:      { count: number; pct: number };
  };

  // High-cost spend concentration
  top5SpendPct?:  number;
  top10SpendPct?: number;
  top5PctCount?:  number;

  // Demographics
  femalePct?: number;
  malePct?: number;
  dependentRatio?: number;
  employeeCount?: number;
  dependentCount?: number;
  genderCounts?: Record<string, number>;
  ageGroups?: Record<string, number>;
  civilStatusCounts?: Record<string, number>;
  relCounts?: Record<string, number>;
  category?: string;
  memberType?: string;
  branches?: string[];

  // High-cost
  highCostMembers?: number;
  highCostPct?: number;
  topMemberCost?: number;
  avgMemberCost?: number;
  mbl?: number;
  memberCostBands?: Record<string, number>;

  // Plans / fund
  planLevelCounts?: Record<string, number>;
  planLevelCosts?: Record<string, number>;
  planLevelPmpm?: Record<string, number>;
  fundCounts?: Record<string, number>;
  fundCosts?: Record<string, number>;

  // Facility / utilisation
  facilityTypeCounts?: Record<string, number>;
  facilityCosts?: Record<string, number>;

  // Claim type
  claimTypeCosts: Record<string, number>;
  claimTypeCounts?: Record<string, number>;

  // Quarterly
  quarterCosts?: Record<string, number>;
  quarterCounts?: Record<string, number>;

  // Policy year trend
  costByPolicyYear?: Record<string, number>;

  // Top diagnoses
  top5Diagnoses: DiagnosisEntry[];

  // Charts
  monthlyChart:     { labels: string[]; pmpm: number[]; count: number[] };
  diagnosisChart?:  { labels: string[]; costs: number[]; counts: number[] };
  claimTypeChart?:  { labels: string[]; counts: number[]; costs: number[] };
  facilityChart?:   { labels: string[]; counts: number[]; costs: number[] };
  memberCostChart?: { labels: string[]; counts: number[] };
  ageGroupChart?:   { labels: string[]; counts: number[] };
  genderChart?:     { labels: string[]; counts: number[] };
  planLevelChart?:  { labels: string[]; costs: number[]; counts: number[]; pmpm: number[] };
  quarterChart?:    { labels: string[]; costs: number[]; counts: number[] };
  top10DiagnosesChart?: { name: string; cost: number; count: number }[];
}

export interface Client {
  id: string;
  name: string;
  members: number;
  pmpy: number;
  pmpm?: number;
  trendPct: number;
  chronicPct: number;
  riskScore: number;          // 0–100 backward compat alias of compositeScore
  compositeScore?: number;    // 0.0–3.0 (primary scoring field)
  clientStatus?: ClientStatus;
  compositeBreakdown?: CompositeBreakdown;
  totalCost: number;
  totalClaims?: number;
  industry: string;
  country: string;
  currency: string;
  meetingDate?: string;
  manager?: string;
  renewalDate?: string;
  renewalOverdue?: boolean;
  planType?: string;
  analytics?: Analytics;
  [key: string]: unknown;
}
