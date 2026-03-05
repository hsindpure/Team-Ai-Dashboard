import { useState, useMemo, useRef, useEffect, type FC } from 'react';
import type { Client } from '../../models/claims/client.model';
import type { DataSource } from '../../models/claims/api.model';
import { riskColor } from '../../utils/risk-color.util';
import { useRecent } from '../../contexts/RecentContext';
import styles from './landing-page.module.scss';

interface LandingPageProps {
  clients: Client[];
  onSelectClient: (id: string) => void;
  dataSource?: DataSource;
}

// ── Category definitions — all logic driven by live data ──────
interface CatDef {
  key: string; label: string; icon: string;
  color: string; bg: string; border: string; desc: string;
  filter: (c: Client) => boolean;
}
const CATEGORIES: CatDef[] = [
  {
    // Improving: client moved DOWN a category vs prior period
    // Color: Yellow (per Marsh spec)
    key: 'improving', label: 'Improving', icon: '📉',
    color: '#f57f17', bg: 'rgba(245,127,23,.13)', border: 'rgba(245,127,23,.28)',
    desc: 'Category improved vs prior period (Acc→Drift or Drift→Stable)',
    filter: (c) => (c as any).clientStatus === 'Improving',
  },
  {
    // Stable: Composite Score 0.0–1.0
    // Color: Green (per Marsh spec)
    key: 'stable', label: 'Stable', icon: '🟢',
    color: '#2e7d32', bg: 'rgba(46,125,50,.13)', border: 'rgba(46,125,50,.28)',
    desc: 'Composite Score 0.0–1.0 — within BOB benchmarks',
    filter: (c) => {
      const cs = (c as any).compositeScore;
      const st = (c as any).clientStatus;
      if (st === 'Stable')   return true;
      if (st)                return false;
      // Fallback to trendPct if compositeScore not available
      return cs !== undefined ? cs <= 1.0 : (c.trendPct > -5 && c.trendPct < 8);
    },
  },
  {
    // Drifting: Composite Score 1.1–1.9
    // Color: Purple (per Marsh spec — changed from orange/yellow)
    key: 'drifting', label: 'Drifting', icon: '🟣',
    color: '#7b1fa2', bg: 'rgba(123,31,162,.13)', border: 'rgba(123,31,162,.28)',
    desc: 'Composite Score 1.1–1.9 — above BOB on one or more dimensions',
    filter: (c) => {
      const cs = (c as any).compositeScore;
      const st = (c as any).clientStatus;
      if (st === 'Drifting')    return true;
      if (st)                   return false;
      return cs !== undefined ? (cs >= 1.1 && cs < 2.0) : (c.trendPct >= 8 && c.trendPct <= 15);
    },
  },
  {
    // Accelerating: Composite Score 2.0–3.0
    // Color: Red (per Marsh spec)
    key: 'accelerating', label: 'Accelerating', icon: '🔴',
    color: '#c62828', bg: 'rgba(198,40,40,.13)', border: 'rgba(198,40,40,.28)',
    desc: 'Composite Score 2.0–3.0 — materially above BOB on multiple dimensions',
    filter: (c) => {
      const cs = (c as any).compositeScore;
      const st = (c as any).clientStatus;
      if (st === 'Accelerating') return true;
      if (st)                    return false;
      return cs !== undefined ? cs >= 2.0 : c.trendPct > 15;
    },
  },
];
// ── Client Search Dropdown ────────────────────────────────────
const ClientDropdown: FC<{ clients: Client[]; onChange: (id: string) => void }> = ({ clients, onChange }) => {
  const [open, setOpen]   = useState(false);
  const [q,    setQ]      = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() =>
    clients.filter((c) =>
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.industry ?? '').toLowerCase().includes(q.toLowerCase())
    ), [clients, q]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className={styles.dd} ref={ref}>
      <button className={styles.ddBtn} onClick={() => setOpen(o => !o)}>
        🔍 Search Client <span className={`${styles.ddArr} ${open ? styles.ddOpen : ''}`}>▾</span>
      </button>
      {open && (
        <div className={styles.ddMenu}>
          <div className={styles.ddSearch}>
            <input autoFocus className={styles.ddInput} placeholder="Name or industry…"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className={styles.ddList}>
            {filtered.length === 0 && <div className={styles.ddEmpty}>No clients found</div>}
            {filtered.map(c => {
              const rc = riskColor((c as any).clientStatus ?? c.riskScore);
              return (
                <div key={c.id} className={styles.ddItem}
                  onClick={() => { onChange(c.id); setOpen(false); setQ(''); }}>
                  <div>
                    <div className={styles.ddName}>{c.name}</div>
                    <div className={styles.ddMeta}>{c.industry} · {c.country}</div>
                  </div>
               <span className="risk-bdg" style={{ background: rc.bg, color: rc.badge, border: `1px solid ${rc.border}` }}>
                    {(c as any).clientStatus ?? (c.trendPct <= -5 ? 'Improving' : c.trendPct < 8 ? 'Stable' : c.trendPct > 15 ? 'Accelerating' : 'Drifting')}
                  </span>
                </div>
              );
            })}
          </div>
          <div className={styles.ddFoot}>{filtered.length} of {clients.length} clients</div>
        </div>
      )}
    </div>
  );
};

// ── Stats strip (bottom of hero) ─────────────────────────────
const StatsStrip: FC<{ clients: Client[] }> = ({ clients }) => {
  const totalCost   = clients.reduce((s, c) => s + (c.totalCost ?? 0), 0);
  const totalClaims = clients.reduce((s, c) => s + (c.totalClaims ?? 0), 0);
  const avgRisk     = clients.length
    ? Math.round(clients.reduce((s, c) => s + c.riskScore, 0) / clients.length) : 0;
  const highRisk    = clients.filter(c => c.riskScore >= 75).length;
  const items = [
    { icon: '🏢', val: `${clients.length}`,                     lbl: 'Total Clients'   },
    { icon: '💰', val: `₱${(totalCost / 1e9).toFixed(1)}B`,     lbl: 'Portfolio Value' },
    { icon: '📋', val: totalClaims.toLocaleString(),            lbl: 'Total Claims'    },
    { icon: '⚠️', val: `${highRisk}`,                           lbl: 'High Risk'       },
    { icon: '📊', val: `${avgRisk}/100`,                        lbl: 'Avg Risk Score'  },
  ];
  return (
    <div className={styles.statsStrip}>
      {items.map(s => (
        <div key={s.lbl} className={styles.statItem}>
          <span className={styles.statIcon}>{s.icon}</span>
          <div>
            <div className={styles.statVal}>{s.val}</div>
            <div className={styles.statLbl}>{s.lbl}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Client Category Tile ──────────────────────────────────────
const CategoryTile: FC<{ clients: Client[]; onSelect: (id: string) => void }> = ({ clients, onSelect }) => {
 type CatWithList = CatDef & { list: Client[] };
const [hovered,  setHovered]  = useState(false);
const [animIn,   setAnimIn]   = useState(false);
const [selected, setSelected] = useState<CatWithList | null>(null);

  const cats = useMemo(() =>
    CATEGORIES.map(cat => ({ ...cat, list: clients.filter(cat.filter) })),
    [clients]
  );

  // const handleEnter = () => {
  //   setHovered(true);
  //   // small rAF delay triggers CSS animation fresh each hover
  //   requestAnimationFrame(() => { setAnimIn(false); requestAnimationFrame(() => setAnimIn(true)); });
  // };
  const handleEnter = () => {
    if (!hovered) {
      setHovered(true);
      setTimeout(() => setAnimIn(true), 20);
    }
  };
  const handleLeave = () => { setHovered(false); setAnimIn(false); };
  const toggleCat   = (cat: typeof cats[0]) => setSelected(p => p?.key === cat.key ? null : cat);

  return (
    <div className={styles.catSection}>
      {/* The single big tile */}
      <div
        className={`${styles.catTile} ${hovered ? styles.catTileHov : ''}`}
        // onMouseEnter={handleEnter}
        // onMouseLeave={handleLeave}
        onMouseEnter={handleEnter}
      >
        {/* ── Collapsed default state ── */}
        <div className={`${styles.catDefault} ${hovered ? styles.catDefaultOut : ''}`}>
          <div className={styles.catDefIcon}>📊</div>
          <div>
            <div className={styles.catDefTitle}>Client Categories</div>
            <div className={styles.catDefSub}>
              {clients.length} clients across {cats.filter(c => c.list.length > 0).length} active categories
            </div>
          </div>
          <div className={styles.catDefHint}>Hover to explore ›</div>
        </div>

        {/* ── Expanded hover state ── */}
        <div className={`${styles.catHov} ${hovered ? styles.catHovIn : ''}`}>
          <div className={styles.catHovHdr}>
            <span className={styles.catHovTitle}>Client Categories</span>
            <span className={styles.catHovSub}>{clients.length} total · click category to drill down</span>
          </div>
          <div className={styles.catGrid}>
            {cats.map((cat, i) => (
              <div
                key={cat.key}
                className={`${styles.catCard} ${animIn ? styles.catCardIn : ''} ${selected?.key === cat.key ? styles.catCardActive : ''}`}
                style={{
                  animationDelay: `${i * 70}ms`,
                  '--cc': cat.color,
                  borderColor: selected?.key === cat.key ? cat.color : cat.border,
                  background:  selected?.key === cat.key ? cat.bg : 'rgba(255,255,255,.04)',
                } as React.CSSProperties}
                onClick={() => toggleCat(cat)}
              >
                <div className={styles.catCardTop}>
                  <span className={styles.catCardIcon}>{cat.icon}</span>
                  <span className={styles.catCardNum} style={{ color: cat.color }}>{cat.list.length}</span>
                </div>
                <div className={styles.catCardLabel}
                  style={{ color: selected?.key === cat.key ? cat.color : '#fff' }}>
                  {cat.label}
                </div>
                <div className={styles.catCardDesc}>{cat.desc}</div>
                <div className={styles.catBar}>
                  <div className={styles.catBarFill}
                    style={{ width: `${(cat.list.length / Math.max(clients.length, 1)) * 100}%`, background: cat.color }} />
                </div>
                <div className={styles.catCardPct} style={{ color: cat.color }}>
                  {((cat.list.length / Math.max(clients.length, 1)) * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Drill-down panel ── */}
      {selected && (
        <div className={styles.drillPanel}>
          <div className={styles.drillHdr}>
            <span>
              {selected.icon} &nbsp;{selected.label}
              <span className={styles.drillCount}>{selected.list.length} clients</span>
            </span>
            <button className={styles.drillClose} onClick={() => setSelected(null)}>✕ Close</button>
          </div>
          <div className={styles.drillGrid}>
            {selected.list.map(c => {
              const rc = riskColor((c as any).clientStatus ?? c.riskScore);
              const up = c.trendPct > 0;
              return (
                <div key={c.id} className={styles.drillCard} onClick={() => onSelect(c.id)}>
                  <div className={styles.drillName}>{c.name}</div>
                  <div className={styles.drillMeta}>
                    <span style={{ color: up ? '#e53935' : '#2e7d32', fontWeight: 700 }}>
                      {up ? '▲' : '▼'} {Math.abs(c.trendPct)}%
                    </span>
                    <span className="risk-bdg"
                      style={{ background: rc.bg, color: rc.badge, border: `1px solid ${rc.border}`, fontSize: 9 }}>
                      {rc.label}
                    </span>
               <span style={{ color: 'rgba(0,9,58,.45)', fontSize: 11 }}>
                      ₱{(c.pmpy ?? 0).toLocaleString()} PMPY
                    </span>
                  </div>
                </div>
              );
            })}
            {selected.list.length === 0 && (
              <div className={styles.drillEmpty}>No clients match this category</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Recently Visited ──────────────────────────────────────────
// const RecentlyVisited: FC<{ onSelect: (id: string) => void }> = ({ onSelect }) => {
//   const { recent, clear } = useRecent();
//   if (recent.length === 0) return null;
//   return (
//     <div className={styles.recentSection}>
//       <div className={styles.recentHdr}>
//         <div>
//           <div className={styles.secTitle}>Recently Visited</div>
//           <div className={styles.secSub}>{recent.length} client{recent.length > 1 ? 's' : ''} · click to reopen</div>
//         </div>
//         <button className={styles.clearBtn} onClick={clear}>Clear all</button>
//       </div>
//       <div className={styles.recentGrid}>
//         {recent.map(c => {
//           const rc  = riskColor((c as any).clientStatus ?? c.riskScore);
//           const up  = c.trendPct > 0;
//           const ini = c.name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
//           return (
//             <div key={c.id} className={styles.recentCard} onClick={() => onSelect(c.id)}>
//               <div className={styles.recentAvatar}>{ini}</div>
//               <div className={styles.recentInfo}>
//                 <div className={styles.recentName}>{c.name}</div>
//                 <div className={styles.recentMeta}>
//                   <span style={{ color: up ? '#e53935' : '#2e7d32', fontWeight: 700, fontSize: 11 }}>
//                     {up ? '▲' : '▼'} {Math.abs(c.trendPct)}%
//                   </span>
//                   <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}>
//                     ₱{(c.pmpy ?? 0).toLocaleString()} PMPY
//                   </span>
//                   <span className="risk-bdg"
//                     style={{ background: rc.bg, color: rc.badge, border: `1px solid ${rc.border}`, fontSize: 9 }}>
//                     {rc.label}
//                   </span>
//                 </div>
//               </div>
//               <span className={styles.recentArrow}>→</span>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// };

const RecentlyVisited: FC<{ onSelect: (id: string) => void }> = ({ onSelect }) => {
  const { recent, clear } = useRecent();
  if (recent.length === 0) return null;
  return (
    <div className={styles.recentSection}>
      <div className={styles.recentHdr}>
        <div>
          <div className={styles.secTitle}>Recently Visited</div>
          <div className={styles.secSub}>{recent.length} client{recent.length > 1 ? 's' : ''} · click to reopen</div>
        </div>
        <button className={styles.clearBtn} onClick={clear}>Clear all</button>
      </div>
      <div className={styles.recentTableWrap}>
        <table className={styles.recentTbl}>
          <thead>
            <tr>
              <th>Client</th>
              <th>Industry</th>
              <th>Members</th>
              <th>PMPY (₱)</th>
              <th>Trend</th>
              <th>Category</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {recent.map(c => {
              const rc  = riskColor((c as any).clientStatus ?? c.riskScore);
              const up  = c.trendPct > 0;
              const ini = c.name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
              const cat: string = (c as any).clientStatus
                ?? (c.trendPct <= -5 ? 'Improving'
                : c.trendPct < 8    ? 'Stable'
                : c.trendPct > 15   ? 'Accelerating'
                : 'Drifting');
              return (
                <tr key={c.id} onClick={() => onSelect(c.id)} className={styles.recentTblRow}>
                  <td>
                    <div className={styles.recentTblName}>
                      <div className={styles.recentTblAv}>{ini}</div>
                      {c.name}
                    </div>
                  </td>
                  <td className={styles.recentTblMuted}>{c.industry ?? '—'}</td>
                  <td className={styles.recentTblMuted}>{c.members?.toLocaleString()}</td>
                  <td className={styles.recentTblMuted}>₱{(c.pmpy ?? 0).toLocaleString()}</td>
                  <td style={{ color: up ? '#e53935' : '#2e7d32', fontWeight: 700, fontSize: 12 }}>
                    {up ? '▲' : '▼'} {Math.abs(c.trendPct)}%
                  </td>
                  <td>
                    <span className="risk-bdg" style={{ background: rc.bg, color: rc.badge, border: `1px solid ${rc.border}` }}>
                      {cat}
                    </span>
                  </td>
                  <td><span className={styles.recentTblOpen}>Open →</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Landing Page root ─────────────────────────────────────────
const LandingPage: FC<LandingPageProps> = ({ clients, onSelectClient, dataSource = 'excel' }) => {
  const { add: addRecent } = useRecent();
  const [clientScope, setClientScope] = useState<'local' | 'multinational'>('local');
  const totalCost = clients.reduce((s, c) => s + (c.totalCost ?? 0), 0);

  const handleSelect = (id: string) => {
    const c = clients.find(cl => cl.id === id);
    if (c) addRecent(c);
    onSelectClient(id);
  };

  return (
    <div className={styles.shell}>

      {/* ── NAVBAR ─────────────────────────────────── */}
      <nav className={styles.nav}>
        <div className={styles.navBrand}>
          <div className={styles.navLogo}>C</div>
          <div>
            <div className={styles.navTitle}>ClaimsIQ</div>
            <div className={styles.navTagline}>Marsh Global Analytics</div>
          </div>
        </div>
     <div className={styles.navRight}>
  <span className={styles.navSrc}>
    {dataSource === 'databricks' ? '⚡ Databricks' : '📊 Excel'}
  </span>

  {/* ── Local / Multinational Toggle ── */}
  <div
    className={`${styles.scopeWrap} ${clientScope === 'multinational' ? styles.scopeWrapMulti : ''}`}
    onClick={() => setClientScope(p => p === 'local' ? 'multinational' : 'local')}
    title="Toggle client scope"
  >
    <span className={`${styles.scopeLabel} ${clientScope === 'local' ? styles.scopeLabelOn : ''}`}>
      Local
    </span>
    <div className={`${styles.scopeTrack} ${clientScope === 'multinational' ? styles.scopeTrackOn : ''}`}>
      <div className={`${styles.scopeThumb} ${clientScope === 'multinational' ? styles.scopeThumbOn : ''}`} />
    </div>
    <span className={`${styles.scopeLabel} ${clientScope === 'multinational' ? styles.scopeLabelOn : ''}`}>
      Multinational
    </span>
  </div>

  <ClientDropdown clients={clients} onChange={handleSelect} />
  <div className={styles.navAvatar}>AM</div>
</div>
      </nav>

      {/* ── HERO BANNER ────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroOrb1} />
        <div className={styles.heroOrb2} />
        <div className={styles.heroOrb3} />
        <div className={styles.heroOrbPk} />
        <div className={styles.heroGrid} />
        <div className={styles.heroScan} />

        <div className={styles.heroBody}>
          <div className={styles.heroBadge}>
            <span className={styles.heroDot} />
            MARSH PHILIPPINES · HMO CLAIMS INTELLIGENCE · LIVE DATA
          </div>
          <h1 className={styles.heroTitle}>
            Strategic Claims<br />
            <span className={styles.heroAccent}>Intelligence</span>
          </h1>
          <p className={styles.heroSub}>
            Analyzing <strong>₱{(totalCost / 1e9).toFixed(1)}B</strong> in HMO claims
            across <strong>{clients.length}</strong> enterprise accounts
          </p>
          <div className={styles.heroSearch}>
            <ClientDropdown clients={clients} onChange={handleSelect} />
          </div>
        </div>

        <StatsStrip clients={clients} />
      </section>

      {/* ── BODY ───────────────────────────────────── */}
      <main className={styles.body}>

        <div className={styles.secHdr}>
          <div className={styles.secTitle}>Portfolio Overview</div>
          <div className={styles.secSub}>Hover the tile below to explore client categories</div>
        </div>

        {/* Single big category tile */}
        <CategoryTile clients={clients} onSelect={handleSelect} />

        {/* Recently visited */}
        <RecentlyVisited onSelect={handleSelect} />

        {/* All-clients table
        <div className={styles.secHdr} style={{ marginTop: 48 }}>
          <div className={styles.secTitle}>All Clients</div>
          <div className={styles.secSub}>{clients.length} accounts · click any row to open brief</div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.tbl}>
            <thead>
              <tr>
                <th>Client</th><th>Members</th><th>PMPY (₱)</th>
                <th>Total Claims</th><th>Trend</th><th>Risk</th><th />
              </tr>
            </thead>
            <tbody>
              {clients.map(c => {
                const rc = riskColor((c as any).clientStatus ?? c.riskScore);
                const up = c.trendPct > 0;
                return (
                  <tr key={c.id} onClick={() => handleSelect(c.id)}>
                    <td className={styles.tdName}>{c.name}</td>
                    <td>{c.members?.toLocaleString()}</td>
                    <td>₱{(c.pmpy ?? 0).toLocaleString()}</td>
                    <td>{(c.totalClaims ?? 0).toLocaleString()}</td>
                    <td style={{ color: up ? '#e53935' : '#2e7d32', fontWeight: 700 }}>
                      {up ? '▲' : '▼'} {Math.abs(c.trendPct)}%
                    </td>
             <td>
                      <span className="risk-bdg"
                        style={{ background: rc.bg, color: rc.badge, border: `1px solid ${rc.border}` }}>
                        {(c as any).clientStatus ?? (c.trendPct <= -5 ? 'Improving' : c.trendPct < 8 ? 'Stable' : c.trendPct > 15 ? 'Accelerating' : 'Drifting')}
                      </span>
                    </td>
                    <td><span className={styles.tdOpen}>Open →</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div> */}

      </main>
    </div>
  );
};

export default LandingPage;
