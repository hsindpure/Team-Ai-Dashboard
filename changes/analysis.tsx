import { useState, useEffect, useCallback, useRef, type FC } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import NavbarCiq from '../navbar-ciq/navbar-ciq';
import { fetchAiAnalysis } from '../../services/claims.service';
import type { Client, Analytics } from '../../models/claims/client.model';
import type { Story, Narrative, AiAnalysis, AiMetric } from '../../models/claims/story.model';
import { fmt, fmtK } from '../../utils/format.util';
import styles from './analysis-view.module.scss';

const CHART_COLORS = ['#000f47','#1a56db','#c8830a','#b83020','#2a6832','#9c27b0','#0097a7','#e65100'];

// ── AI Hook ───────────────────────────────────────────────────
function useAiAnalysis(clientId?: string, storyId?: string) {
  const [analysis,     setAnalysis]     = useState<AiAnalysis | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const reqRef = useRef(0);

  const run = useCallback(async (forceRefresh = false) => {
    if (!clientId || !storyId) return;
    const id = ++reqRef.current;
    forceRefresh ? setRegenerating(true) : setLoading(true);
    setError(null);
    try {
      const result = await fetchAiAnalysis(clientId, storyId, forceRefresh);
      if (id === reqRef.current) setAnalysis(result);
    } catch (e) {
      if (id === reqRef.current) setError((e as Error).message);
    } finally {
      if (id === reqRef.current) { setLoading(false); setRegenerating(false); }
    }
  }, [clientId, storyId]);

  useEffect(() => { setAnalysis(null); setError(null); void run(false); }, [run]);
  return { analysis, loading, error, regenerating, regenerate: () => void run(true) };
}

// ── Skeleton ──────────────────────────────────────────────────
const Skel: FC<{ width?: string; height?: number; mb?: number }> = ({ width = '100%', height = 13, mb = 9 }) => (
  <div className={styles.avSkeleton} style={{ width, height, marginBottom: mb }} />
);

// ── Metric Tile ───────────────────────────────────────────────
const MetricTile: FC<{ m: AiMetric }> = ({ m }) => {
  const bad = m.dir === 'bad'; const good = m.dir === 'good';
  const arrow = bad ? '↑' : good ? '↓' : '→';
  const deltaClr = bad ? 'var(--red)' : good ? 'var(--green)' : 'var(--amber)';
  return (
    <div className={styles.avMt}>
      <div className={styles.avMtBar} style={{ background: bad ? 'var(--red)' : good ? 'var(--green)' : 'var(--amber)' }} />
      <div className={styles.avMtL}>{m.label}</div>
      <div className={styles.avMtV}>{m.value}</div>
      {m.delta && <div className={styles.avMtD} style={{ color: deltaClr }}>{m.dir !== 'neutral' ? `${arrow} ${m.delta}` : m.delta}</div>}
      {m.bench && <div className={styles.avMtB}>{m.benchLabel ?? 'Industry'}: {m.bench}</div>}
    </div>
  );
};

// ── Tooltip ───────────────────────────────────────────────────
interface TipProps { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string; currency?: boolean; }
const ChartTooltip: FC<TipProps> = ({ active, payload, label, currency = true }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.avTooltip}>
      <div className={styles.avTooltipLabel}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} className={styles.avTooltipRow}>
          <span className={styles.avTooltipDot} style={{ background: p.color }} />
          <span>{p.name}: <strong>{currency ? fmtK(p.value) : p.value?.toLocaleString()}</strong></span>
        </div>
      ))}
    </div>
  );
};

// ── Charts ────────────────────────────────────────────────────
const MonthlyCostChart: FC<{ analytics: Analytics | null; color?: string }> = ({ analytics, color = '#000f47' }) => {
  const mc = analytics?.monthlyChart;
  const data = mc?.labels?.length
    ? mc.labels.map((l, i) => ({ period: l, PMPM: mc.pmpm?.[i] ?? 0 }))
    : ['Q1 22','Q2 22','Q3 22','Q4 22','Q1 23','Q2 23'].map((p, i) => ({ period: p, PMPM: 320 + i * 26 }));
  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={data} margin={{ top: 6, right: 10, left: -4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" stroke="#e4e4ec" vertical={false} />
        <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={42} tickFormatter={fmtK} />
        <Tooltip content={<ChartTooltip />} />
        <Line type="monotone" dataKey="PMPM" stroke={color} strokeWidth={2.5}
          dot={{ r: 4, fill: '#fff', stroke: color, strokeWidth: 2 }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

const DiagnosisBarChart: FC<{ analytics: Analytics | null }> = ({ analytics }) => {
  const dc = analytics?.diagnosisChart;
  const data = dc?.labels?.length
    ? dc.labels.map((l, i) => ({ name: l.length > 18 ? l.slice(0, 18) + '…' : l, cost: dc.costs?.[i] ?? 0 }))
    : [{ name: 'Digestive', cost: 450000 },{ name: 'Respiratory', cost: 380000 },{ name: 'Musculoskeletal', cost: 290000 },{ name: 'Cardiovascular', cost: 220000 },{ name: 'Nervous', cost: 180000 }];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" stroke="#e4e4ec" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#333' }} axisLine={false} tickLine={false} width={110} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const ClaimTypeDonut: FC<{ analytics: Analytics | null }> = ({ analytics }) => {
  const entries = Object.entries(analytics?.claimTypeCosts ?? {}).sort((a, b) => b[1] - a[1]);
  const data = entries.length ? entries.map(([name, value]) => ({ name, value: Math.round(value) })) : [{ name: 'Dental', value: 45 },{ name: 'Medical', value: 38 },{ name: 'Optical', value: 10 }];
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <ResponsiveContainer width={160} height={160}>
        <PieChart><Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie><Tooltip formatter={(v: number) => [fmtK(v), '']} /></PieChart>
      </ResponsiveContainer>
      <div style={{ flex: 1, fontSize: 12 }}>
        {data.slice(0, 5).map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
            <span style={{ flex: 1, color: '#444', fontWeight: 500 }}>{d.name}</span>
            <span style={{ color: '#888' }}>{total ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const AgeGroupChart: FC<{ analytics: Analytics | null }> = ({ analytics }) => {
  const ag = analytics?.ageGroups ?? {};
  const data = Object.keys(ag).length ? Object.entries(ag).map(([name, count]) => ({ name, count })) : [{ name: '21-30', count: 145 },{ name: '31-35', count: 310 },{ name: '36-40', count: 280 },{ name: '41-50', count: 198 }];
  return (
    <ResponsiveContainer width="100%" height={170}>
      <BarChart data={data} margin={{ top: 4, right: 10, left: -4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" stroke="#e4e4ec" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={34} />
        <Tooltip content={<ChartTooltip currency={false} />} />
        <Bar dataKey="count" fill="#000f47" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

const GenderDonut: FC<{ analytics: Analytics | null }> = ({ analytics }) => {
  const gc = analytics?.genderCounts ?? {};
  const entries = Object.entries(gc).filter(([, v]) => v > 0);
  const data = entries.length ? entries.map(([name, value]) => ({ name, value })) : [{ name: 'Male', value: 55 },{ name: 'Female', value: 45 }];
  const total = data.reduce((s, d) => s + d.value, 0);
  const colors = ['#000f47','#c8830a','#2a6832','#b83020'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <ResponsiveContainer width={130} height={130}>
        <PieChart><Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3}>
          {data.map((_, i) => <Cell key={i} fill={colors[i % 4]} />)}
        </Pie></PieChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 12 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: colors[i % 4], flexShrink: 0 }} />
            <span style={{ color: '#444', fontWeight: 500 }}>{d.name}</span>
            <span style={{ color: '#888', marginLeft: 4 }}>{total ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const PlanLevelChart: FC<{ analytics: Analytics | null }> = ({ analytics }) => {
  const plpm = analytics?.planLevelPmpm ?? {};
  const data = Object.keys(plpm).length
    ? Object.entries(plpm).sort((a, b) => b[1] - a[1]).map(([plan, pmpm]) => ({ name: plan.length > 20 ? plan.slice(0, 20) + '…' : plan, pmpm }))
    : [{ name: 'Platinum 3', pmpm: 1450 },{ name: 'Basic', pmpm: 850 },{ name: 'Staff', pmpm: 620 }];
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 10, left: -4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" stroke="#e4e4ec" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={48} tickFormatter={fmtK} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="pmpm" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const QuarterChart: FC<{ analytics: Analytics | null }> = ({ analytics }) => {
  const qc = analytics?.quarterChart;
  const data = qc?.labels?.length
    ? qc.labels.map((l, i) => ({ name: l, cost: qc.costs?.[i] ?? 0 }))
    : [{ name: 'Q1', cost: 320000 },{ name: 'Q2', cost: 290000 },{ name: 'Q3', cost: 410000 },{ name: 'Q4', cost: 380000 }];
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 10, left: -4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" stroke="#e4e4ec" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={48} tickFormatter={fmtK} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const MemberCostBandChart: FC<{ analytics: Analytics | null }> = ({ analytics }) => {
  const bands = analytics?.memberCostBands ?? {};
  const data = Object.keys(bands).length
    ? Object.entries(bands).map(([name, count]) => ({ name, count }))
    : [{ name: 'Below ₱50k', count: 520 },{ name: '₱50k–100k', count: 180 },{ name: '₱100k–200k', count: 95 },{ name: '₱200k–400k', count: 42 },{ name: '₱400k+ (MBL)', count: 8 }];
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 10, left: -4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" stroke="#e4e4ec" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#888' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={34} />
        <Tooltip content={<ChartTooltip currency={false} />} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={i === data.length - 1 ? '#b83020' : i >= data.length - 2 ? '#c87e00' : '#000f47'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const FacilityDonut: FC<{ analytics: Analytics | null }> = ({ analytics }) => {
  const fc = analytics?.facilityTypeCounts ?? {};
  const entries = Object.entries(fc).sort((a, b) => b[1] - a[1]);
  const data = entries.length ? entries.map(([name, value]) => ({ name, value })) : [{ name: 'Clinic', value: 65 },{ name: 'Hospital', value: 28 }];
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <ResponsiveContainer width={130} height={130}>
        <PieChart><Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie></PieChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 12 }}>
        {data.slice(0, 5).map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
            <span style={{ color: '#444', fontWeight: 500 }}>{d.name}</span>
            <span style={{ color: '#888', marginLeft: 4 }}>{total ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const StoryChart: FC<{ storyId: string; analytics: Analytics | null; color: string }> = ({ storyId, analytics, color }) => {
  switch (storyId) {
    case 'cost_trend': return <div><div className={styles.avChartSublabel}>Monthly PMPM Trend (₱)</div><MonthlyCostChart analytics={analytics} color={color} /><div style={{ marginTop: 16 }}><div className={styles.avChartSublabel}>Claim Type Breakdown</div><ClaimTypeDonut analytics={analytics} /></div></div>;
    case 'top5_diagnosis': return <div><div className={styles.avChartSublabel}>Top Illness Groups by Approved Cost</div><DiagnosisBarChart analytics={analytics} /></div>;
    case 'high_cost': return <div><div className={styles.avChartSublabel}>Member Cost Distribution</div><MemberCostBandChart analytics={analytics} /><div style={{ marginTop: 14 }}><div className={styles.avChartSublabel}>Monthly PMPM</div><MonthlyCostChart analytics={analytics} color="#b83020" /></div></div>;
    case 'census_analysis': return <div><div className={styles.avChartSublabel}>Age Group Distribution</div><AgeGroupChart analytics={analytics} /><div style={{ marginTop: 14 }}><div className={styles.avChartSublabel}>Gender Split</div><GenderDonut analytics={analytics} /></div></div>;
    case 'utilization': return <div><div className={styles.avChartSublabel}>Quarterly Claim Spend</div><QuarterChart analytics={analytics} /><div style={{ marginTop: 14 }}><div className={styles.avChartSublabel}>Facility Type</div><FacilityDonut analytics={analytics} /></div></div>;
    case 'plan_perf': return <div><div className={styles.avChartSublabel}>PMPM by Plan Level</div><PlanLevelChart analytics={analytics} /><div style={{ marginTop: 14 }}><div className={styles.avChartSublabel}>Claim Type Split</div><ClaimTypeDonut analytics={analytics} /></div></div>;
    default: return <MonthlyCostChart analytics={analytics} color={color} />;
  }
};

// ── Analytics Summary Strip ───────────────────────────────────
const AnalyticsSummaryStrip: FC<{ client: Client; storyId: string }> = ({ client }) => {
  const a = client?.analytics;
  if (!a) return null;

  const pmpy          = (a?.pmpy     ?? (client as any).pmpy     ?? 0) as number;
  const trendPct      = (a?.trendPct ?? (client as any).trendPct ?? 0) as number;
  const pmpm          = (a?.pmpm     ?? (client as any).pmpm     ?? 0) as number;
  const riskStrat     = (a?.riskStratification ?? (client as any).riskStratification ?? null) as {
    critical: { count: number; pct: number }; high: { count: number; pct: number };
    medium:   { count: number; pct: number }; low:  { count: number; pct: number };
  } | null;
  const highRiskPct   = riskStrat
    ? Math.round((riskStrat.critical.pct + riskStrat.high.pct) * 10) / 10
    : ((a?.highCostPct ?? (client as any).highCostPct ?? 0) as number);
  const highRiskCount = riskStrat ? riskStrat.critical.count + riskStrat.high.count : 0;
  const top5SpendPct  = (a?.top5SpendPct ?? (client as any).top5SpendPct ?? 0) as number;
  const hrSpendPct    = top5SpendPct > 0 ? top5SpendPct
    : highRiskPct > 0 ? Math.min(95, Math.round(highRiskPct * 3.2)) : 0;
  const chronicGroups = (a?.chronicGroups ?? (client as any).chronicGroups ?? []) as { name: string; pct: number }[];
  const BOB_DIABETES  = 18;
  const diabGroup     = chronicGroups.find((g: { name: string; pct: number }) => /diabet|endocrin|metabol/i.test(g.name));
  const diabetesPct   = diabGroup?.pct ?? 0;
  const diabetesVar   = Math.round((diabetesPct - BOB_DIABETES) * 10) / 10;
  const top5PctCount  = (a?.top5PctCount   ?? (client as any).top5PctCount   ?? 0) as number;
  const hcMembers     = (a?.highCostMembers ?? (client as any).highCostMembers ?? 0) as number;
  const topClaimants  = top5PctCount > 0 ? top5PctCount : hcMembers;
  const top10SpendPct = (a?.top10SpendPct  ?? (client as any).top10SpendPct  ?? 0) as number;
  const claimantSpend = top5SpendPct > 0 ? top5SpendPct : top10SpendPct;

  const kpis = [
    {
      label: 'PMPY vs Prior Period',
      value: pmpy > 0 ? fmt(pmpy) : fmt(pmpm * 12),
      sub:   trendPct !== 0 ? `${trendPct > 0 ? '▲' : '▼'} ${Math.abs(trendPct)}% vs prior year` : 'No prior year data',
      bad:   trendPct > 0,
    },
    {
      label: 'High Risk Members',
      value: highRiskPct > 0 ? `${highRiskPct}%` : '—',
      sub:   hrSpendPct > 0 ? `Driving ${hrSpendPct}% of total spend`
           : highRiskCount > 0 ? `${highRiskCount.toLocaleString()} members`
           : 'Risk data unavailable',
      bad: highRiskPct > 20,
    },
    {
      label: 'Diabetes Prevalence',
      value: diabetesPct > 0 ? `${diabetesPct}%` : '—',
      sub:   diabetesPct > 0
           ? `BOB: ${BOB_DIABETES}% · Variance: ${diabetesVar > 0 ? '+' : ''}${diabetesVar} pts`
           : 'Chronic group data unavailable',
      bad: diabetesVar > 5,
    },
    {
      label: 'Top Cost Claimants',
      value: topClaimants > 0 ? topClaimants.toLocaleString() : '—',
      sub:   claimantSpend > 0 ? `Representing ${claimantSpend}% of total spend`
           : 'Spend concentration data unavailable',
      bad: claimantSpend > 40,
    },
  ];

  return (
    <div className={styles.avStrip}>
      {kpis.map((k, i) => (
        <div key={i} className={styles.avSk}>
          <div className={styles.avSkL}>{k.label}</div>
          <div className={`${styles.avSkV} ${k.bad ? styles.avSkVBad : ''}`}>{k.value}</div>
          <div className={styles.avSkS}>{k.sub}</div>
        </div>
      ))}
    </div>
  );
};

// ── Talking Points ────────────────────────────────────────────
const TalkingPoints: FC<{ points: string[]; onExport?: (pts: string[]) => void }> = ({ points, onExport }) => {
  const [checked,  setChecked]  = useState<Record<number, boolean>>({});
  const [custom,   setCustom]   = useState<string[]>([]);
  const [note,     setNote]     = useState('');
  const [addedMsg, setAddedMsg] = useState(false);
  const [exported, setExported] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const allPoints   = [...points, ...custom];
  const numSelected = Object.values(checked).filter(Boolean).length;
  const toggle = (i: number) => setChecked((p) => ({ ...p, [i]: !p[i] }));
  const addNote = () => {
    const text = note.trim(); if (!text) return;
    const idx = allPoints.length;
    setCustom((c) => [...c, text]); setChecked((p) => ({ ...p, [idx]: true }));
    setNote(''); setAddedMsg(true);
    setTimeout(() => { setAddedMsg(false); inputRef.current?.focus(); }, 1800);
  };
  const handleExport = () => {
    setExported(true); onExport?.(allPoints.filter((_, i) => checked[i]));
    setTimeout(() => setExported(false), 2500);
  };
  return (
    <div className={styles.avTp}>
      <div className={styles.avTpHdr}>
        <span className={styles.avTpTtl}>TALKING POINTS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={styles.avTpHint}>{numSelected > 0 ? `${numSelected} selected` : 'Click to select'}</span>
          <button className={`${styles.avTpCopy} ${exported ? 'ok' : ''}`} onClick={handleExport}>{exported ? '✓ Copied!' : 'Copy All'}</button>
        </div>
      </div>
      <div className={styles.avTpDivider} />
      {allPoints.length === 0 && <div className={styles.avTpEmpty}>AI is generating talking points…</div>}
      {allPoints.map((pt, i) => (
        <div key={i} className={`${styles.avTpRow} ${checked[i] ? styles.on : ''}`} onClick={() => toggle(i)}>
          <div className={styles.avTpCheck}>
            {checked[i] && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="#2e7d32" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </div>
          <span className={styles.avTpTxt}>{pt}{i >= points.length && <span className={styles.avTpBadge}>custom</span>}</span>
        </div>
      ))}
      <div className={styles.avAddSec}>
        <div className={styles.avAddLbl}>ADD YOUR OWN</div>
        <div className={styles.avAddRow}>
          <input ref={inputRef} className={styles.avAddIn} value={note} onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNote()} placeholder="Add a talking point specific to this client…" />
          <button className={`${styles.avAddBtn} ${addedMsg ? 'ok' : ''}`} onClick={addNote}>{addedMsg ? '✓ Added' : 'Add'}</button>
        </div>
      </div>
      <div className={styles.avExpRow}>
        <span className={styles.avExpNote}>{numSelected > 0 ? `${numSelected} point${numSelected > 1 ? 's' : ''} selected` : 'Select points to export'}</span>
        <button className={`${styles.avExpBtn} ${exported ? 'done' : ''}`} onClick={handleExport}>{exported ? '✓ Exported!' : 'Export to PowerPoint →'}</button>
      </div>
    </div>
  );
};

// ── Analysis View ─────────────────────────────────────────────
interface AnalysisViewProps {
  client: Client | null;
  clients?: Client[];
  storyId: string;
  narratives?: Record<string, Narrative>;
  stories?: Story[];
  reloading?: boolean;
  onBack: () => void;
  onClientChange?: (id: string) => void;
  onReload?: () => void;
  onLogoClick?: () => void;
}

const AnalysisView: FC<AnalysisViewProps> = ({
  client, clients, storyId, narratives, stories, reloading,
  onBack, onClientChange, onReload, onLogoClick,
}) => {
  const xlsxN = narratives?.[storyId];
  const tmpl  = stories?.find((s) => s.id === storyId);
  const { analysis, loading, error, regenerating, regenerate } = useAiAnalysis(client?.id, storyId);

  if (!client) return null;
  const isBusy    = loading || regenerating;
  const analytics = client.analytics ?? null;
  const headline  = analysis?.headline     ?? xlsxN?.headline ?? '';
  const insight   = analysis?.insight      ?? xlsxN?.insight  ?? '';
  const soWhat    = analysis?.so_what      ?? xlsxN?.so_what  ?? '';
  const tpPoints  = analysis?.talking_points?.length ? analysis.talking_points : (xlsxN?.talking_points ?? []);
  const metrics   = analysis?.ai_metrics?.length     ? analysis.ai_metrics     : (xlsxN?.metrics ?? []);
  const storyLabel = tmpl?.label ?? storyId.replace(/_/g, ' ');
  const storyIcon  = tmpl?.icon  ?? '📊';

  return (
    <div className={styles.avShell}>
      <NavbarCiq client={client} clients={clients} reloading={reloading}
        onClientChange={onClientChange} onReload={onReload} onLogoClick={onLogoClick} />

      <div className={styles.avHero}>
        <div className={styles.avHeroOrb} />
        <div className={styles.avHeroGrid} />
        <div className={styles.avHeroActions}>
          <button className={styles.avRegen} onClick={regenerate} disabled={isBusy}>
            {regenerating ? '⟳ Regenerating…' : '⟳ Regenerate AI Insight'}
          </button>
        </div>
        <div className={styles.avBack} onClick={onBack}>← Back to Brief</div>
        <div className={styles.avHeroTitle}>{storyIcon} {storyLabel} Analysis</div>
        <div className={styles.avHeroSub}>Deep dive into {storyLabel.toLowerCase()} claim patterns for {client.name}</div>
      </div>

      <div className={styles.avBody}>
        <div className={styles.avTags}>
          <span className={`${styles.avTag} ${isBusy ? styles.busy : 'ai'}`}>{isBusy ? '⟳ AI generating…' : '✦ AI Analysis'}</span>
          {analytics && <span className={`${styles.avTag} live`}>📊 Live Data</span>}
        </div>

        {analytics && <AnalyticsSummaryStrip client={client} storyId={storyId} />}

        <div className={styles.avMetrics}>
          {loading
            ? [0,1,2,3].map((i) => <div key={i} className={styles.avMt}><div className={styles.avMtBar} style={{ background: 'var(--bdr)' }} /><Skel width="55%" height={9} mb={10} /><Skel width="45%" height={26} mb={8} /><Skel width="38%" height={9} mb={6} /></div>)
            : metrics.length > 0 ? metrics.map((m, i) => <MetricTile key={i} m={m} />) : null}
        </div>

        <div className={styles.avMain}>
          <div className={styles.avLeft}>
            <div className={styles.avHlCard}>
              {error ? (
                <div className={styles.avErr}>
                  <span className={styles.avErrIco}>⚠</span>
                  <div><div className={styles.avErrTtl}>AI unavailable</div><div className={styles.avErrBody}>{error}</div></div>
                  <button className={styles.avErrRetry} onClick={regenerate}>↺ Retry</button>
                </div>
              ) : loading ? (
                <><Skel width="90%" height={24} mb={10} /><Skel width="65%" height={24} /></>
              ) : (
                <div className={styles.avHlText}>
                  {(headline || 'Generating analysis…').split(/(\d+%?)/).map((part, i) =>
                    /^\d+%?$/.test(part) ? <span key={i} className={styles.avHlTextHl}>{part}</span> : part
                  )}
                </div>
              )}
              {insight && !loading && <div className={styles.avHlSub}>{insight}</div>}
              {analytics && (() => {
                const rs         = (analytics as any).riskStratification ?? null;
                const hrPct      = rs
                  ? Math.round(((rs.critical?.pct ?? 0) + (rs.high?.pct ?? 0)) * 10) / 10
                  : ((analytics as any).highCostPct ?? 0) as number;
                const hrCount    = rs ? (rs.critical?.count ?? 0) + (rs.high?.count ?? 0) : 0;
                const t5spend    = (analytics as any).top5SpendPct ?? 0;
                const t10spend   = (analytics as any).top10SpendPct ?? 0;
                const spendProxy = t5spend > 0 ? t5spend : hrPct > 0 ? Math.min(95, Math.round(hrPct * 3.2)) : 0;
                const cGroups    = ((analytics as any).chronicGroups ?? []) as { name: string; pct: number }[];
                const diabGroup  = cGroups.find((g: { name: string; pct: number }) => /diabet|endocrin|metabol/i.test(g.name));
                const diabPct    = diabGroup?.pct ?? 0;
                const diabVar    = Math.round((diabPct - 18) * 10) / 10;
                const t5count    = (analytics as any).top5PctCount ?? (analytics as any).highCostMembers ?? 0;
                const claimSpend = t5spend > 0 ? t5spend : t10spend;
                const pmpy       = (analytics as any).pmpy ?? 0;
                return (
                  <div className={styles.avChips}>
                    {([
                      {
                        l: 'PMPY VS PRIOR PERIOD',
                        v: pmpy > 0 ? fmt(pmpy) : fmt((analytics.pmpm ?? 0) * 12),
                        s: `${(analytics.trendPct ?? 0) > 0 ? '▲' : '▼'} ${Math.abs(analytics.trendPct ?? 0)}% vs prior year`,
                        bad: (analytics.trendPct ?? 0) > 0,
                      },
                      {
                        l: 'HIGH RISK MEMBERS',
                        v: hrPct > 0 ? `${hrPct}%` : '—',
                        s: spendProxy > 0 ? `Driving ${spendProxy}% of spend`
                         : hrCount > 0 ? `${(hrCount as number).toLocaleString()} members`
                         : 'Critical + High tier',
                        bad: hrPct > 20,
                      },
                      {
                        l: 'DIABETES PREVALENCE',
                        v: diabPct > 0 ? `${diabPct}%` : '—',
                        s: diabPct > 0
                          ? `BOB: 18% · Variance: ${diabVar > 0 ? '+' : ''}${diabVar} pts`
                          : 'Chronic data unavailable',
                        bad: diabVar > 5,
                      },
                      {
                        l: 'TOP COST CLAIMANTS',
                        v: (t5count as number) > 0 ? (t5count as number).toLocaleString() : '—',
                        s: claimSpend > 0 ? `Representing ${claimSpend}% of total spend`
                         : 'Concentration data unavailable',
                        bad: claimSpend > 40,
                      },
                    ] as { l: string; v: string; s: string; bad: boolean }[]).map((c, i) => (
                      <div key={i}>
                        <div className={styles.avChipL}>{c.l}</div>
                        <div className={`${styles.avChipV} ${c.bad ? styles.avChipVBad : ''}`}>{c.v}</div>
                        <div className={styles.avChipS}>{c.s}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className={styles.avChartCard}>
              <div className={styles.avChartLbl}>Claim Volume Trend: {storyLabel} vs Other</div>
              <StoryChart storyId={storyId} analytics={analytics} color="#1a237e" />
            </div>
          </div>

          <div className={styles.avRight}>
            <div className={styles.avAi}>
              <div className={styles.avAiLbl}>💡 AI Summary</div>
              {loading ? <><Skel height={11} mb={7} /><Skel height={11} mb={7} /><Skel width="72%" height={11} /></> : <div className={styles.avAiText}>{soWhat || 'Generating AI summary…'}</div>}
              <div className={styles.avConfRow}>
                <span className={styles.avConf}>High Confidence</span>
                <span className={styles.avConf}>Data Source: Claims + HIS</span>
              </div>
            </div>
            <div className={styles.avAction}>
              <div className={styles.avActionLbl}>Recommended Action</div>
              {loading ? <><Skel height={11} mb={7} /><Skel width="80%" height={11} /></> : <div className={styles.avActionTxt}>{soWhat ? 'Launch targeted wellness program focusing on primary cost drivers. Negotiate bulk screening package with Provider Network.' : 'Generating recommendations…'}</div>}
              <button className={styles.avActionBtn}>Create Wellness Proposal</button>
            </div>
            <TalkingPoints points={tpPoints} onExport={(pts) => console.log('[export]', pts)} />
          </div>
        </div>

        <div style={{ paddingTop: 12 }}>
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--wh)', transition: 'all .2s' }}>
            ← Back to Client Brief
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalysisView;
