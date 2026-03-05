import type { FC } from 'react';
import type { Client } from '../../models/claims/client.model';
import type { Story, Narrative } from '../../models/claims/story.model';
import NavbarCiq from '../navbar-ciq/navbar-ciq';
import { fmt } from '../../utils/format.util';
import styles from './client-brief.module.scss';

const DEFAULT_STORIES: Story[] = [
  { id: 'cost_trend',      icon: '📈', label: 'Cost Trend',          desc: 'How costs moved vs prior year and benchmark',           premium: false },
  { id: 'top5_diagnosis',  icon: '🩺', label: 'Top 5 Diagnosis',     desc: 'Leading diagnosis categories driving claim spend',      premium: false },
  { id: 'high_cost',       icon: '🔴', label: 'High-Cost Claimants', desc: 'Top cost drivers and impact on total spend',            premium: false },
  { id: 'census_analysis', icon: '📊', label: 'Census Analysis',     desc: 'Member demographics, age bands and dependency trends', premium: false },
  { id: 'utilization',     icon: '🏥', label: 'Utilization Shifts',  desc: 'ER, inpatient, and preventive care patterns',          premium: true  },
  { id: 'plan_perf',       icon: '⚖️', label: 'Plan Performance',    desc: 'HDHP vs PPO enrollment, OOP, and engagement',         premium: true  },
];

// ── Helpers ───────────────────────────────────────────────────
const pctColor = (v: number) => v > 0 ? '#e53935' : v < 0 ? '#2e7d32' : '#8892b0';
const pctArrow = (v: number) => v > 0 ? '▲' : v < 0 ? '▼' : '—';
const fmtB = (v: number) =>
  v >= 1e9 ? `₱${(v / 1e9).toFixed(1)}B` :
  v >= 1e6 ? `₱${(v / 1e6).toFixed(1)}M` :
  `₱${v.toLocaleString()}`;

// ── KPI Strip (4 KPIs per spec) ──────────────────────────────
// 1. PMPY vs Prior Period
// 2. High Risk Members  — % driving % of spend
// 3. Diabetes Prevalence — vs BOB benchmark
// 4. Top Cost Claimants — count & % of spend
interface KpiStripProps { client: Client; }
const KpiStrip: FC<KpiStripProps> = ({ client }) => {
  const a = client?.analytics;

  // ── 1. PMPY vs Prior Period ───────────────────────────────
  const pmpy           = (a?.pmpy       ?? (client as any).pmpy       ?? 0) as number;
  const trendPct       = (a?.trendPct   ?? (client as any).trendPct   ?? 0) as number;
  const pmpm           = (a?.pmpm       ?? (client as any).pmpm       ?? 0) as number;
  const costByYear     = (a?.costByPolicyYear ?? (client as any).costByPolicyYear ?? {}) as Record<string, number>;
  const pyYears        = Object.keys(costByYear).sort();
  const currYrCost     = pyYears.length     ? (costByYear[pyYears[pyYears.length - 1]] ?? 0) : 0;
  const priorYrCost    = pyYears.length > 1 ? (costByYear[pyYears[pyYears.length - 2]] ?? 0) : 0;
  const pmpyDelta      = priorYrCost > 0
    ? Math.round(((currYrCost - priorYrCost) / priorYrCost) * 1000) / 10
    : trendPct;
  const pmpyDisplay    = pmpy > 0 ? fmt(pmpy) : pmpm > 0 ? fmt(pmpm * 12) : '—';
  const priorPmpyDisplay = priorYrCost > 0
    ? fmt(priorYrCost / Math.max(1, (client.members ?? 1)))
    : null;

  // ── 2. High Risk Members ─────────────────────────────────
  const riskStrat = (a?.riskStratification ?? (client as any).riskStratification ?? null) as {
    critical: { count: number; pct: number };
    high:     { count: number; pct: number };
    medium:   { count: number; pct: number };
    low:      { count: number; pct: number };
  } | null;
  const highRiskPct   = riskStrat
    ? Math.round((riskStrat.critical.pct + riskStrat.high.pct) * 10) / 10
    : ((a?.highCostPct ?? (client as any).highCostPct ?? 0) as number);
  const highRiskCount = riskStrat
    ? riskStrat.critical.count + riskStrat.high.count
    : ((a?.highCostMembers ?? (client as any).highCostMembers ?? 0) as number);
  const top5SpendPct  = (a?.top5SpendPct ?? (client as any).top5SpendPct ?? 0) as number;
  // spend driven by high-risk: use top5SpendPct as proxy or estimate
  const hrSpendPct    = top5SpendPct > 0 ? top5SpendPct
    : highRiskPct > 0 ? Math.min(95, Math.round(highRiskPct * 3.2)) : 0;

  // ── 3. Diabetes Prevalence ────────────────────────────────
  const chronicGroups = (a?.chronicGroups ?? (client as any).chronicGroups ?? []) as {
    name: string; count: number; pct: number; cost: number;
  }[];
  const BOB_DIABETES  = 18; // Book-of-Business benchmark
  const diabGroup     = chronicGroups.find(g =>
    /diabet|endocrin|metabol/i.test(g.name)
  );
  const diabetesPct   = diabGroup?.pct ?? 0;
  const diabetesVar   = Math.round((diabetesPct - BOB_DIABETES) * 10) / 10;

  // ── 4. Top Cost Claimants ─────────────────────────────────
  const top5PctCount  = (a?.top5PctCount   ?? (client as any).top5PctCount   ?? 0) as number;
  const hcMembers     = (a?.highCostMembers ?? (client as any).highCostMembers ?? 0) as number;
  const topClaimants  = top5PctCount > 0 ? top5PctCount : hcMembers;
  const top10SpendPct = (a?.top10SpendPct  ?? (client as any).top10SpendPct  ?? 0) as number;
  const claimantSpend = top5SpendPct > 0 ? top5SpendPct : top10SpendPct;

  const pctColor = (v: number, bad = true) =>
    v === 0 ? '#8892b0' : bad ? (v > 0 ? '#c62828' : '#2e7d32') : (v > 0 ? '#2e7d32' : '#c62828');

  return (
    <div className={styles.kpiStrip}>

      {/* ── KPI 1: PMPY vs Prior Period ── */}
      <div className={styles.kpiCard}>
        <div className={styles.kpiHead}>
          <span className={styles.kpiIcon}>💰</span>
          <span className={styles.kpiLabel}>PMPY vs Prior Period</span>
        </div>
        <div className={styles.kpiMain}>{pmpyDisplay}</div>
        <div className={styles.kpiRow}>
          {priorPmpyDisplay && (
            <span className={styles.kpiMuted}>Prior: {priorPmpyDisplay}</span>
          )}
          <span
            className={styles.kpiBadge}
            style={{
              color:      pmpyDelta > 0 ? '#b71c1c' : pmpyDelta < 0 ? '#1b5e20' : '#4a5178',
              background: pmpyDelta > 0 ? '#ffebee' : pmpyDelta < 0 ? '#e8f5e9' : '#f4f6fb',
            }}
          >
            {pmpyDelta > 0 ? `▲ +${pmpyDelta}%` : pmpyDelta < 0 ? `▼ ${pmpyDelta}%` : '— Flat'}
          </span>
        </div>
        <div className={styles.kpiSub} style={{ color: pctColor(pmpyDelta) }}>
          {pmpyDelta > 15 ? 'Accelerating — action required'
          : pmpyDelta > 8  ? 'Drifting — monitor closely'
          : pmpyDelta < -5 ? 'Improving — cost declining'
          : pmpyDelta !== 0 ? 'Stable — within tolerance'
          : 'No prior year available'}
        </div>
      </div>

      {/* ── KPI 2: High Risk Members ── */}
      <div className={styles.kpiCard}>
        <div className={styles.kpiHead}>
          <span className={styles.kpiIcon}>⚡</span>
          <span className={styles.kpiLabel}>High Risk Members</span>
        </div>
        <div className={styles.kpiMain} style={{ color: highRiskPct >= 25 ? '#c62828' : highRiskPct >= 15 ? '#e65100' : '#1a1f36' }}>
          {highRiskPct > 0 ? `${highRiskPct}%` : '—'}
        </div>
        <div className={styles.kpiRow}>
          {highRiskCount > 0 && (
            <span className={styles.kpiMuted}>{highRiskCount.toLocaleString()} members</span>
          )}
          {hrSpendPct > 0 && (
            <span
              className={styles.kpiBadge}
              style={{ color: '#b71c1c', background: '#ffebee' }}
            >
              {hrSpendPct}% of spend
            </span>
          )}
        </div>
        <div className={styles.kpiSub}>
          {hrSpendPct > 0
            ? `Driving ${hrSpendPct}% of total spend`
            : highRiskPct > 0 ? 'Critical + High risk tier'
            : 'Risk stratification data loading'}
        </div>
      </div>

      {/* ── KPI 3: Diabetes Prevalence ── */}
      <div className={styles.kpiCard}>
        <div className={styles.kpiHead}>
          <span className={styles.kpiIcon}>🩸</span>
          <span className={styles.kpiLabel}>Diabetes Prevalence</span>
        </div>
        <div className={styles.kpiMain} style={{ color: diabetesVar > 10 ? '#c62828' : diabetesVar > 5 ? '#e65100' : '#1a1f36' }}>
          {diabetesPct > 0 ? `${diabetesPct}%` : '—'}
        </div>
        <div className={styles.kpiRow}>
          <span className={styles.kpiMuted}>BOB: {BOB_DIABETES}%</span>
          {diabetesPct > 0 && (
            <span
              className={styles.kpiBadge}
              style={{
                color:      diabetesVar > 5 ? '#b71c1c' : diabetesVar < -2 ? '#1b5e20' : '#4a5178',
                background: diabetesVar > 5 ? '#ffebee' : diabetesVar < -2 ? '#e8f5e9' : '#f4f6fb',
              }}
            >
              {diabetesVar > 0 ? `+${diabetesVar}` : diabetesVar} pts
            </span>
          )}
        </div>
        <div className={styles.kpiSub}>
          {diabetesPct > 0
            ? `Variance: ${diabetesVar > 0 ? '+' : ''}${diabetesVar} pts vs BOB`
            : 'Chronic group data unavailable'}
        </div>
      </div>

      {/* ── KPI 4: Top Cost Claimants ── */}
      <div className={styles.kpiCard}>
        <div className={styles.kpiHead}>
          <span className={styles.kpiIcon}>🎯</span>
          <span className={styles.kpiLabel}>Top Cost Claimants</span>
        </div>
        <div className={styles.kpiMain} style={{ color: claimantSpend >= 50 ? '#c62828' : claimantSpend >= 30 ? '#e65100' : '#1a1f36' }}>
          {topClaimants > 0 ? topClaimants.toLocaleString() : '—'}
        </div>
        <div className={styles.kpiRow}>
          <span className={styles.kpiMuted}>Top 5% threshold</span>
          {claimantSpend > 0 && (
            <span
              className={styles.kpiBadge}
              style={{ color: '#b71c1c', background: '#ffebee' }}
            >
              {claimantSpend}% of spend
            </span>
          )}
        </div>
        <div className={styles.kpiSub}>
          {claimantSpend > 0
            ? `Representing ${claimantSpend}% of total spend`
            : topClaimants > 0 ? 'Spend concentration data loading'
            : 'High-cost member data unavailable'}
        </div>
      </div>

    </div>
  );
};

// ── Four Analytics Tiles ──────────────────────────────────────
interface FourTilesProps { client: Client; }
const FourTiles: FC<FourTilesProps> = ({ client }) => {
  const a = client?.analytics;

  // Read all fields with direct-client fallback
  const totalClaims   = (a?.totalClaims   ?? (client as any).totalClaims   ?? 0)  as number;
  const totalApproved = (a?.totalApproved ?? (client as any).totalApproved  ?? 0)  as number;
  const top5Diagnoses = (a?.top5Diagnoses ?? (client as any).top5Diagnoses  ?? []) as { name: string; cost?: number; count: number; pct: number }[];
  const top10Chart    = (a?.top10DiagnosesChart ?? (client as any).top10DiagnosesChart ?? []) as { name: string; cost: number; count: number }[];
  const highCostPct   = (a?.highCostPct   ?? (client as any).highCostPct   ?? 0)  as number;
  const highCostMembers=(a?.highCostMembers?? (client as any).highCostMembers?? 0) as number;
  const top5SpendPct  = (a?.top5SpendPct  ?? (client as any).top5SpendPct  ?? 0)  as number;
  const top10SpendPct = (a?.top10SpendPct ?? (client as any).top10SpendPct ?? 0)  as number;
  const top5PctCount  = (a?.top5PctCount  ?? (client as any).top5PctCount  ?? 0)  as number;
  const chronicPct    = (a?.chronicPct    ?? (client as any).chronicPct    ?? 0)  as number;
  const chronicGroups = (a?.chronicGroups ?? (client as any).chronicGroups ?? []) as { name: string; count: number; cost: number; pct: number }[];
  const riskStrat     = (a?.riskStratification ?? (client as any).riskStratification ?? null) as {
    critical: { count: number; pct: number };
    high:     { count: number; pct: number };
    medium:   { count: number; pct: number };
    low:      { count: number; pct: number };
  } | null;
  const members = (client.members ?? (client as any).members ?? 0) as number;
  const riskScore = (client.riskScore ?? 0) as number;

  // Top diagnoses: prefer top10Chart for richness, fall back to top5Diagnoses
  const diagList = top10Chart.length > 0
    ? top10Chart.slice(0, 8)
    : top5Diagnoses.map(d => ({ name: d.name, cost: d.cost ?? 0, count: d.count }));
  const totalDiagCost = diagList.reduce((s, d) => s + d.cost, 0) || totalApproved || 1;

  // Risk tier bar data
  const riskTiers = riskStrat ? [
    { label: 'Critical', count: riskStrat.critical.count, pct: riskStrat.critical.pct, color: '#b71c1c' },
    { label: 'High',     count: riskStrat.high.count,     pct: riskStrat.high.pct,     color: '#e53935' },
    { label: 'Medium',   count: riskStrat.medium.count,   pct: riskStrat.medium.pct,   color: '#fb8c00' },
    { label: 'Low',      count: riskStrat.low.count,      pct: riskStrat.low.pct,      color: '#43a047' },
  ] : [];

  return (
    <div className={styles.fourTilesGrid}>

      {/* ── TILE 1: Top Diagnostics ── */}
      <div className={styles.tile}>
        <div className={styles.tileHdr}>
          <span className={styles.tileIcon}>🩺</span>
          <div>
            <div className={styles.tileTitle}>Top Diagnostics</div>
            <div className={styles.tileSub}>Ranked by total cost · % of spend</div>
          </div>
        </div>
        <div className={styles.diagList}>
          {diagList.length === 0 && <div className={styles.tileEmpty}>No diagnosis data available</div>}
          {diagList.map((d, i) => {
            const spendPct = parseFloat(((d.cost / totalDiagCost) * 100).toFixed(1));
            const barW     = Math.min(100, spendPct * 2.5);
            return (
              <div key={d.name} className={styles.diagRow}>
                <div className={styles.diagRank}>#{i + 1}</div>
                <div className={styles.diagBody}>
                  <div className={styles.diagName}>{d.name}</div>
                  <div className={styles.diagBar}>
                    <div className={styles.diagBarFill} style={{ width: `${barW}%` }} />
                  </div>
                </div>
                <div className={styles.diagStats}>
                  <span className={styles.diagCost}>{fmtB(d.cost)}</span>
                  <span className={styles.diagPct}>{spendPct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── TILE 2: High-Cost Claimants ── */}
      <div className={styles.tile}>
        <div className={styles.tileHdr}>
          <span className={styles.tileIcon}>🔴</span>
          <div>
            <div className={styles.tileTitle}>High-Cost Claimants</div>
            <div className={styles.tileSub}>Spend concentration analysis</div>
          </div>
        </div>

        {/* Big metric */}
        <div className={styles.hcMain}>
          <div className={styles.hcBig} style={{ color: top5SpendPct > 60 ? '#e53935' : top5SpendPct > 40 ? '#fb8c00' : '#43a047' }}>
            {top5SpendPct > 0 ? `${top5SpendPct}%` : highCostPct > 0 ? `${highCostPct}%` : '—'}
          </div>
          <div className={styles.hcBigLabel}>
            {top5SpendPct > 0 ? 'of spend from top 5% of members' : 'high-cost claimant rate'}
          </div>
        </div>

        <div className={styles.hcRows}>
          <div className={styles.hcRow}>
            <span className={styles.hcLabel}>Top 5% members</span>
            <span className={styles.hcVal}>{top5PctCount > 0 ? top5PctCount.toLocaleString() : highCostMembers > 0 ? highCostMembers.toLocaleString() : '—'}</span>
          </div>
          <div className={styles.hcRow}>
            <span className={styles.hcLabel}>Top 5% spend share</span>
            <span className={styles.hcVal} style={{ color: top5SpendPct > 50 ? '#e53935' : '#1a1f36' }}>
              {top5SpendPct > 0 ? `${top5SpendPct}%` : '—'}
            </span>
          </div>
          <div className={styles.hcRow}>
            <span className={styles.hcLabel}>Top 10% spend share</span>
            <span className={styles.hcVal} style={{ color: top10SpendPct > 70 ? '#e53935' : '#1a1f36' }}>
              {top10SpendPct > 0 ? `${top10SpendPct}%` : '—'}
            </span>
          </div>
          <div className={styles.hcRow}>
            <span className={styles.hcLabel}>High-cost rate (MBL)</span>
            <span className={styles.hcVal}>{highCostPct > 0 ? `${highCostPct}%` : '—'}</span>
          </div>
        </div>

        <div className={styles.hcNote}>
          Threshold: top 5% of members by approved cost
        </div>
      </div>

      {/* ── TILE 3: Chronic Condition Prevalence ── */}
      <div className={styles.tile}>
        <div className={styles.tileHdr}>
          <span className={styles.tileIcon}>🫀</span>
          <div>
            <div className={styles.tileTitle}>Chronic Condition Prevalence</div>
            <div className={styles.tileSub}>ICD10 mapped to chronic categories</div>
          </div>
        </div>

        <div className={styles.chronicOverall}>
          <span className={styles.chronicBig} style={{ color: chronicPct > 40 ? '#e53935' : chronicPct > 20 ? '#fb8c00' : '#43a047' }}>
            {chronicPct > 0 ? `${chronicPct}%` : '—'}
          </span>
          <span className={styles.chronicBigLabel}>overall chronic claim rate</span>
        </div>

        <div className={styles.chronicList}>
          {chronicGroups.length === 0 && (
            <div className={styles.tileEmpty}>Chronic group data not yet computed — apply backend patch</div>
          )}
          {chronicGroups.slice(0, 6).map(g => (
            <div key={g.name} className={styles.chronicRow}>
              <div className={styles.chronicName}>{g.name}</div>
              <div className={styles.chronicBarWrap}>
                <div className={styles.chronicBar} style={{ width: `${Math.min(100, g.pct * 3)}%` }} />
              </div>
              <div className={styles.chronicStats}>
                <span className={styles.chronicCount}>{g.count}</span>
                <span className={styles.chronicPct}>{g.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TILE 4: Risk Stratification ── */}
      <div className={styles.tile}>
        <div className={styles.tileHdr}>
          <span className={styles.tileIcon}>⚡</span>
          <div>
            <div className={styles.tileTitle}>Risk Stratification</div>
            <div className={styles.tileSub}>Member population by risk tier</div>
          </div>
        </div>

        <div className={styles.riskScore}>
          <div className={styles.riskScoreCircle} style={{
            background: riskScore >= 75 ? 'rgba(229,57,53,.12)' : riskScore >= 50 ? 'rgba(251,140,0,.12)' : 'rgba(67,160,71,.12)',
            borderColor: riskScore >= 75 ? '#e53935' : riskScore >= 50 ? '#fb8c00' : '#43a047',
          }}>
            <div className={styles.riskScoreNum} style={{ color: riskScore >= 75 ? '#e53935' : riskScore >= 50 ? '#fb8c00' : '#43a047' }}>
              {riskScore}
            </div>
            <div className={styles.riskScoreLabel}>Risk Score</div>
          </div>
          <div className={styles.riskScoreMeta}>
            <div className={styles.riskScoreTag} style={{
              color: riskScore >= 75 ? '#e53935' : riskScore >= 50 ? '#fb8c00' : '#43a047',
              background: riskScore >= 75 ? 'rgba(229,57,53,.10)' : riskScore >= 50 ? 'rgba(251,140,0,.10)' : 'rgba(67,160,71,.10)',
            }}>
              {riskScore >= 75 ? 'Accelerating' : riskScore >= 50 ? 'Drifting' : riskScore >= 25 ? 'Stable' : 'Improving'}
            </div>
            <div className={styles.riskMemberCount}>{members.toLocaleString()} members</div>
          </div>
        </div>

        {riskTiers.length > 0 ? (
          <div className={styles.riskTiers}>
            {riskTiers.map(t => (
              <div key={t.label} className={styles.riskTierRow}>
                <div className={styles.riskTierLeft}>
                  <span className={styles.riskTierDot} style={{ background: t.color }} />
                  <span className={styles.riskTierLabel}>{t.label}</span>
                </div>
                <div className={styles.riskTierBarWrap}>
                  <div className={styles.riskTierBar} style={{ width: `${t.pct}%`, background: t.color }} />
                </div>
                <div className={styles.riskTierRight}>
                  <span className={styles.riskTierCount}>{t.count.toLocaleString()}</span>
                  <span className={styles.riskTierPct}>{t.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.riskFallback}>
            <div className={styles.riskFallbackRow}>
              <span>Chronic burden</span>
              <strong style={{ color: chronicPct > 40 ? '#e53935' : chronicPct > 20 ? '#fb8c00' : '#43a047' }}>{chronicPct}%</strong>
            </div>
            <div className={styles.riskFallbackRow}>
              <span>High-cost claimant rate</span>
              <strong style={{ color: highCostPct > 20 ? '#e53935' : '#43a047' }}>{highCostPct}%</strong>
            </div>
            <div className={styles.riskFallbackNote}>
              Apply backend patch to enable full member stratification
            </div>
          </div>
        )}
      </div>

    </div>
  );
};


// ── Clickable Analytics Tiles (replace the 4 non-premium story cards) ────────
interface ClickableTilesProps {
  client: Client;
  onSelectStory: (storyId: string) => void;
}
const ClickableTiles: FC<ClickableTilesProps> = ({ client, onSelectStory }) => {
  const a = client?.analytics;

  // ── Data reads with fallback ──────────────────────────────
  const totalApproved  = (a?.totalApproved  ?? (client as any).totalApproved  ?? 0)  as number;
  const top5Diagnoses  = (a?.top5Diagnoses  ?? (client as any).top5Diagnoses  ?? []) as { name: string; cost?: number; count: number; pct: number }[];
  const top10Chart     = (a?.top10DiagnosesChart ?? (client as any).top10DiagnosesChart ?? []) as { name: string; cost: number; count: number }[];
  const highCostPct    = (a?.highCostPct    ?? (client as any).highCostPct    ?? 0)   as number;
  const highCostMembers= (a?.highCostMembers ?? (client as any).highCostMembers ?? 0) as number;
  const top5SpendPct   = (a?.top5SpendPct   ?? (client as any).top5SpendPct   ?? 0)  as number;
  const top10SpendPct  = (a?.top10SpendPct  ?? (client as any).top10SpendPct  ?? 0)  as number;
  const top5PctCount   = (a?.top5PctCount   ?? (client as any).top5PctCount   ?? 0)  as number;
  const chronicPct     = (a?.chronicPct     ?? (client as any).chronicPct     ?? 0)  as number;
  const chronicGroups  = (a?.chronicGroups  ?? (client as any).chronicGroups  ?? []) as { name: string; count: number; cost: number; pct: number }[];
  const riskStrat      = (a?.riskStratification ?? (client as any).riskStratification ?? null) as {
    critical: { count: number; pct: number };
    high:     { count: number; pct: number };
    medium:   { count: number; pct: number };
    low:      { count: number; pct: number };
  } | null;
  const riskScore = (client.riskScore ?? 0) as number;
  const members   = (client.members   ?? 0) as number;

  const diagList = top10Chart.length > 0
    ? top10Chart.slice(0, 5)
    : top5Diagnoses.slice(0, 5).map(d => ({ name: d.name, cost: d.cost ?? 0, count: d.count }));
  const totalDiagCost = diagList.reduce((s, d) => s + d.cost, 0) || totalApproved || 1;

  // Risk tier rows — 4-tier scale
  const riskTiers = riskStrat ? [
    { label: 'Very High', count: riskStrat.critical.count, pct: riskStrat.critical.pct, color: '#b71c1c' },
    { label: 'High',      count: riskStrat.high.count,     pct: riskStrat.high.pct,     color: '#e53935' },
    { label: 'Medium',    count: riskStrat.medium.count,   pct: riskStrat.medium.pct,   color: '#fb8c00' },
    { label: 'Low',       count: riskStrat.low.count,      pct: riskStrat.low.pct,      color: '#43a047' },
  ] : [];

  const tiles = [
    { id: 'top_diagnostics',    label: 'Top Diagnostics',             icon: '🩺', accentColor: '#1a237e' },
    { id: 'high_cost_claimants',label: 'High-Cost Claimants',         icon: '🔴', accentColor: '#b71c1c' },
    { id: 'chronic_prevalence', label: 'Chronic Condition Prevalence',icon: '🫀', accentColor: '#7b1fa2' },
    { id: 'risk_stratification',label: 'Risk Stratification',         icon: '⚡', accentColor: '#e65100' },
  ];

  return (
    <div className={styles.ctGrid}>

      {/* ── TILE 1: Top Diagnostics ── */}
      <div className={styles.ctCard} onClick={() => onSelectStory('top_diagnostics')}
        style={{ '--ct-accent': tiles[0].accentColor } as React.CSSProperties}>
        <div className={styles.ctTopbar} style={{ background: tiles[0].accentColor }} />
        <div className={styles.ctHdr}>
          <span className={styles.ctIcon}>{tiles[0].icon}</span>
          <div>
            <div className={styles.ctTitle}>{tiles[0].label}</div>
            <div className={styles.ctSub}>Ranked by cost · % of total spend</div>
          </div>
          <span className={styles.ctCta}>View →</span>
        </div>
        <div className={styles.ctDiagList}>
          {diagList.length === 0 && <div className={styles.ctEmpty}>No data</div>}
          {diagList.map((d, i) => {
            const spendPct = parseFloat(((d.cost / totalDiagCost) * 100).toFixed(1));
            return (
              <div key={d.name} className={styles.ctDiagRow}>
                <span className={styles.ctDiagRank}>#{i + 1}</span>
                <div className={styles.ctDiagBody}>
                  <div className={styles.ctDiagName}>{d.name}</div>
                  <div className={styles.ctDiagBar}>
                    <div className={styles.ctDiagFill}
                      style={{ width: `${Math.min(100, spendPct * 2.5)}%`, background: tiles[0].accentColor }} />
                  </div>
                </div>
                <div className={styles.ctDiagMeta}>
                  <span className={styles.ctDiagCost}>{fmtB(d.cost)}</span>
                  <span className={styles.ctDiagPct}>{spendPct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── TILE 2: High-Cost Claimants ── */}
      <div className={styles.ctCard} onClick={() => onSelectStory('high_cost_claimants')}
        style={{ '--ct-accent': tiles[1].accentColor } as React.CSSProperties}>
        <div className={styles.ctTopbar} style={{ background: tiles[1].accentColor }} />
        <div className={styles.ctHdr}>
          <span className={styles.ctIcon}>{tiles[1].icon}</span>
          <div>
            <div className={styles.ctTitle}>{tiles[1].label}</div>
            <div className={styles.ctSub}>Spend concentration · top 5% threshold</div>
          </div>
          <span className={styles.ctCta}>View →</span>
        </div>
        <div className={styles.ctHcMain}>
          <div className={styles.ctHcBig}
            style={{ color: top5SpendPct > 60 ? '#b71c1c' : top5SpendPct > 40 ? '#fb8c00' : '#2e7d32' }}>
            {top5SpendPct > 0 ? `${top5SpendPct}%` : highCostPct > 0 ? `${highCostPct}%` : '—'}
          </div>
          <div className={styles.ctHcBigLbl}>
            {top5SpendPct > 0 ? 'of total spend from top 5% of members' : 'high-cost claimant rate (MBL basis)'}
          </div>
        </div>
        <div className={styles.ctRows}>
          <div className={styles.ctRow}>
            <span>Top 5% members</span>
            <strong>{top5PctCount > 0 ? top5PctCount.toLocaleString() : highCostMembers > 0 ? highCostMembers.toLocaleString() : '—'}</strong>
          </div>
          <div className={styles.ctRow}>
            <span>Top 10% spend share</span>
            <strong style={{ color: top10SpendPct > 70 ? '#b71c1c' : 'inherit' }}>
              {top10SpendPct > 0 ? `${top10SpendPct}%` : '—'}
            </strong>
          </div>
          <div className={styles.ctRow}>
            <span>High-cost rate (MBL)</span>
            <strong>{highCostPct > 0 ? `${highCostPct}%` : '—'}</strong>
          </div>
        </div>
        <div className={styles.ctNote}>Threshold: top 5% of members by approved cost</div>
      </div>

      {/* ── TILE 3: Chronic Condition Prevalence ── */}
      <div className={styles.ctCard} onClick={() => onSelectStory('chronic_prevalence')}
        style={{ '--ct-accent': tiles[2].accentColor } as React.CSSProperties}>
        <div className={styles.ctTopbar} style={{ background: tiles[2].accentColor }} />
        <div className={styles.ctHdr}>
          <span className={styles.ctIcon}>{tiles[2].icon}</span>
          <div>
            <div className={styles.ctTitle}>{tiles[2].label}</div>
            <div className={styles.ctSub}>ICD10 mapped to chronic categories</div>
          </div>
          <span className={styles.ctCta}>View →</span>
        </div>
        <div className={styles.ctChronicMain}>
          <span className={styles.ctChronicBig}
            style={{ color: chronicPct > 40 ? '#b71c1c' : chronicPct > 20 ? '#fb8c00' : '#2e7d32' }}>
            {chronicPct > 0 ? `${chronicPct}%` : '—'}
          </span>
          <span className={styles.ctChronicLbl}>overall chronic claim rate</span>
        </div>
        <div className={styles.ctChronicList}>
          {chronicGroups.length === 0 && (
            <div className={styles.ctEmpty}>Apply backend patch for grouped data</div>
          )}
          {chronicGroups.slice(0, 5).map(g => (
            <div key={g.name} className={styles.ctChronicRow}>
              <span className={styles.ctChronicName}>{g.name}</span>
              <div className={styles.ctChronicBarWrap}>
                <div className={styles.ctChronicBar}
                  style={{ width: `${Math.min(100, g.pct * 3)}%`, background: tiles[2].accentColor }} />
              </div>
              <span className={styles.ctChronicPct}>{g.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── TILE 4: Risk Stratification ── */}
      <div className={styles.ctCard} onClick={() => onSelectStory('risk_stratification')}
        style={{ '--ct-accent': tiles[3].accentColor } as React.CSSProperties}>
        <div className={styles.ctTopbar} style={{ background: tiles[3].accentColor }} />
        <div className={styles.ctHdr}>
          <span className={styles.ctIcon}>{tiles[3].icon}</span>
          <div>
            <div className={styles.ctTitle}>{tiles[3].label}</div>
            <div className={styles.ctSub}>4-tier scale: Low · Medium · High · Very High</div>
          </div>
          <span className={styles.ctCta}>View →</span>
        </div>
        <div className={styles.ctRiskScore}>
          <div className={styles.ctRiskCircle}
            style={{
              background:  riskScore >= 75 ? 'rgba(183,28,28,.10)' : riskScore >= 50 ? 'rgba(251,140,0,.10)' : 'rgba(46,125,50,.10)',
              borderColor: riskScore >= 75 ? '#b71c1c' : riskScore >= 50 ? '#fb8c00' : '#2e7d32',
            }}>
            <div className={styles.ctRiskNum}
              style={{ color: riskScore >= 75 ? '#b71c1c' : riskScore >= 50 ? '#fb8c00' : '#2e7d32' }}>
              {riskScore}
            </div>
            <div className={styles.ctRiskLbl}>Risk Score</div>
          </div>
          <div className={styles.ctRiskTag}
            style={{
              color:      riskScore >= 75 ? '#b71c1c' : riskScore >= 50 ? '#fb8c00' : '#2e7d32',
              background: riskScore >= 75 ? 'rgba(183,28,28,.08)' : riskScore >= 50 ? 'rgba(251,140,0,.08)' : 'rgba(46,125,50,.08)',
            }}>
            {riskScore >= 75 ? 'Accelerating' : riskScore >= 50 ? 'Drifting' : riskScore >= 25 ? 'Stable' : 'Improving'}
          </div>
        </div>
        {riskTiers.length > 0 ? (
          <div className={styles.ctTiers}>
            {riskTiers.map(t => (
              <div key={t.label} className={styles.ctTierRow}>
                <div className={styles.ctTierLeft}>
                  <span className={styles.ctTierDot} style={{ background: t.color }} />
                  <span className={styles.ctTierLabel}>{t.label}</span>
                </div>
                <div className={styles.ctTierBarWrap}>
                  <div className={styles.ctTierBar} style={{ width: `${t.pct}%`, background: t.color }} />
                </div>
                <div className={styles.ctTierRight}>
                  <span className={styles.ctTierCount}>{t.count.toLocaleString()}</span>
                  <span className={styles.ctTierPct}>{t.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.ctTiers}>
            {[
              { label: 'Very High', pct: Math.min(100, riskScore > 75 ? 30 : 10), color: '#b71c1c' },
              { label: 'High',      pct: Math.min(100, riskScore > 50 ? 25 : 15), color: '#e53935' },
              { label: 'Medium',    pct: Math.min(100, 35),                        color: '#fb8c00' },
              { label: 'Low',       pct: Math.min(100, riskScore < 50 ? 40 : 20), color: '#43a047' },
            ].map(t => (
              <div key={t.label} className={styles.ctTierRow}>
                <div className={styles.ctTierLeft}>
                  <span className={styles.ctTierDot} style={{ background: t.color }} />
                  <span className={styles.ctTierLabel}>{t.label}</span>
                </div>
                <div className={styles.ctTierBarWrap}>
                  <div className={styles.ctTierBar} style={{ width: `${t.pct}%`, background: t.color }} />
                </div>
                <div className={styles.ctTierRight}>
                  <span className={styles.ctTierPct}>{t.pct}%</span>
                </div>
              </div>
            ))}
            <div className={styles.ctNote}>Apply backend patch for exact member counts</div>
          </div>
        )}
      </div>

    </div>
  );
};

// ── Client Brief ──────────────────────────────────────────────
interface ClientBriefProps {
  client?: Client | null;
  clients?: Client[];
  stories?: Story[];
  narratives?: Record<string, Narrative>;
  reloading?: boolean;
  isPremium?: boolean;
  onSelectStory: (storyId: string) => void;
  onClientChange?: (id: string) => void;
  onReload?: () => void;
  onLogoClick?: () => void;
}

const ClientBrief: FC<ClientBriefProps> = ({
  client, clients, stories, narratives, reloading,
  isPremium = false, onSelectStory, onClientChange, onReload, onLogoClick,
}) => {
  if (!client) {
    return (
      <div className="loading-screen">
        <div style={{ fontSize: 44 }}>📋</div>
        <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>No client selected</p>
        <p style={{ color: 'var(--ink-muted)' }}>Select a client from the dropdown above</p>
      </div>
    );
  }

  const storyList = Array.isArray(stories) && stories.length > 0 ? stories : DEFAULT_STORIES;
  const initials  = client.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <div className="screen-shell">
      <NavbarCiq
        client={client} clients={clients} reloading={reloading}
        onClientChange={onClientChange} onReload={onReload} onLogoClick={onLogoClick}
      />

      {/* Hero */}
      <div className={styles.briefHero}>
        <div className={styles.bhOrb} />
        <div className={styles.bhGrid} />
        <div className={styles.briefClientRow}>
          <div className={styles.bcAvatar}>{initials}</div>
          <div>
            <div className={styles.bcName}>{client.name}</div>
            <div className={styles.bcMeta}>
              {client.members?.toLocaleString()} members
              {client.industry ? ` · ${client.industry}` : ''}
              {client.country  ? ` · ${client.country}`  : ''}
            </div>
          </div>
        </div>
      </div>

      {/* KPI strips */}
      <KpiStrip client={client} />

      {/* Four analytics tiles */}
      {/* <FourTiles client={client} /> */}

      <div className={styles.briefBody}>
        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <div className={styles.eyebrow}><span className={styles.eyebrowBar} />CLIENT BRIEF</div>
            <h1 className={styles.clientName}>{client.name}</h1>
            <p className={styles.clientMeta}>
              {client.members?.toLocaleString()} members
              {client.industry ? ` · ${client.industry}` : ''}
              {client.country  ? ` · ${client.country}`  : ''}
            </p>
          </div>
          {(client.meetingDate || client.manager) && (
            <div className={styles.meetingBadge}>
              <div className={styles.meetingLabel}>NEXT MEETING</div>
              {client.meetingDate && <div className={styles.meetingDate}>{client.meetingDate}</div>}
              {client.manager    && <div className={styles.meetingWith}>with {client.manager}</div>}
            </div>
          )}
        </div>

        <div className={styles.divider} />
{/* 
        <div className={styles.storiesHead}>
          <span className={styles.sectionLabel}>CHOOSE A STORY TO BUILD</span>
          {!isPremium && <span className={styles.premiumNotice}>🔒 Some stories require a Premium plan</span>}
        </div>

        <div className={styles.storyGrid}>
          {storyList.map((t, idx) => {
            const isLocked    = t.premium && !isPremium;
            const hasXlsxData = !!narratives?.[t.id];
            return (
              <div
                key={t.id}
                className={`${styles.storyCard} ${isLocked ? styles.storyLocked : ''}`}
                style={{ animationDelay: `${idx * 0.04}s` }}
                onClick={() => !isLocked && onSelectStory(t.id)}
                title={isLocked ? 'Upgrade to Premium to unlock this story' : ''}
              >
                <div className={`${styles.cardTopbar} ${isLocked ? styles.cardTopbarLocked : styles.cardTopbarActive}`} />
                <div className={styles.iconRow}>
                  <span className={styles.storyIcon}>{t.icon ?? '📊'}</span>
                  {isLocked && <span className={styles.lockBadge}>🔒</span>}
                  {t.premium && isPremium && <span className={styles.premiumBadge}>PREMIUM</span>}
                </div>
                <div className={`${styles.storyTitle} ${isLocked ? styles.storyTitleLocked : ''}`}>{t.label}</div>
                <div className={styles.storyDesc}>{t.desc}</div>
                <div className={styles.storyFooter}>
                  {isLocked
                    ? <span className={styles.storyUpgrade}>Upgrade to unlock →</span>
                    : <span className={styles.storyCta}>{hasXlsxData ? 'Build →' : 'AI Brief →'}</span>}
                </div>
              </div>
            );
          })}
        </div>
        
        */}

        <div className={styles.storiesHead}>
          <span className={styles.sectionLabel}>ANALYTICS — CLICK TO EXPLORE</span>
          {!isPremium && <span className={styles.premiumNotice}>🔒 Some stories require a Premium plan</span>}
        </div>

        {/* ── 4 clickable analytics tiles ── */}
        <ClickableTiles client={client} onSelectStory={onSelectStory} />

        {/* ── Premium locked tiles only ── */}
        <div className={styles.storyGrid} style={{ marginTop: 16 }}>
          {storyList.filter(t => t.premium).map((t, idx) => {
            const isLocked = !isPremium;
            return (
              <div
                key={t.id}
                className={`${styles.storyCard} ${isLocked ? styles.storyLocked : ''}`}
                style={{ animationDelay: `${idx * 0.04}s` }}
                onClick={() => !isLocked && onSelectStory(t.id)}
                title={isLocked ? 'Upgrade to Premium to unlock this story' : ''}
              >
                <div className={`${styles.cardTopbar} ${isLocked ? styles.cardTopbarLocked : styles.cardTopbarActive}`} />
                <div className={styles.iconRow}>
                  <span className={styles.storyIcon}>{t.icon ?? '📊'}</span>
                  {isLocked && <span className={styles.lockBadge}>🔒</span>}
                  {t.premium && isPremium && <span className={styles.premiumBadge}>PREMIUM</span>}
                </div>
                <div className={`${styles.storyTitle} ${isLocked ? styles.storyTitleLocked : ''}`}>{t.label}</div>
                <div className={styles.storyDesc}>{t.desc}</div>
                <div className={styles.storyFooter}>
                  {isLocked
                    ? <span className={styles.storyUpgrade}>Upgrade to unlock →</span>
                    : <span className={styles.storyCta}>Build →</span>}
                </div>
              </div>
            );
          })}
        </div>

        {storyList === DEFAULT_STORIES && Object.keys(narratives ?? {}).length === 0 && (
          <div style={{ marginTop: 32 }}>
            <div className={styles.sectionLabel}>CLIENT DATA FROM EXCEL</div>
            <div className={styles.rawDataCard}>
              <table className={styles.dataTable}>
                <thead><tr><th>Field</th><th>Value</th></tr></thead>
                <tbody>
                  {Object.entries(client)
                    .filter(([k]) => k !== 'id')
                    .map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ fontWeight: 600, textTransform: 'capitalize', color: 'var(--navy)' }}>
                          {k.replace(/_/g, ' ')}
                        </td>
                        <td>{v !== null && v !== undefined ? String(v) : '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientBrief;
