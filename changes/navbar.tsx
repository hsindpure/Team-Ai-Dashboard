import { useState, type FC } from 'react';
import type { Client } from '../../models/claims/client.model';
import styles from './navbar-ciq.module.scss';

interface NavbarCiqProps {
  client?: Client | null;
  clients?: Client[];
  reloading?: boolean;
  clientScope?: 'local' | 'multinational';
  onClientChange?: (id: string) => void;
  onReload?: () => void;
  onLogoClick?: () => void;
  onScopeChange?: (scope: 'local' | 'multinational') => void;
}

const NavbarCiq: FC<NavbarCiqProps> = ({
  client, clients = [], reloading,
  clientScope = 'local',
  onClientChange, onReload, onLogoClick, onScopeChange,
}) => {
  const [scope, setScope] = useState<'local' | 'multinational'>(clientScope);

  const initials = client?.name
    ? client.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '–';

  const handleToggle = () => {
    const next = scope === 'local' ? 'multinational' : 'local';
    setScope(next);
    onScopeChange?.(next);
  };

  const isMulti = scope === 'multinational';

  return (
    <nav className={styles.navbar}>

      {/* ── Brand ── */}
      <div className={styles.brand} onClick={onLogoClick}>
        <div className={styles.logo}>C</div>
        <span className={styles.brandName}>ClaimsIQ</span>
      </div>

      {/* ── Client Switcher ── */}
      <div className={styles.navCompany}>
        <div className={styles.coIcon}>{initials.slice(0, 2)}</div>
        <select
          className={styles.navSel}
          value={client?.id ?? ''}
          onChange={(e) => onClientChange?.(e.target.value)}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <span className={styles.coChev}>▾</span>
      </div>

      {/* ── Right Controls ── */}
      <div className={styles.navRight}>

        {/* Local / Multinational Toggle */}
        <div
          className={`${styles.scopeWrap} ${isMulti ? styles.scopeWrapMulti : ''}`}
          onClick={handleToggle}
          title={`Switch to ${isMulti ? 'Local' : 'Multinational'}`}
        >
          <span className={`${styles.scopeLabel} ${!isMulti ? styles.scopeLabelOn : ''}`}>
            Local
          </span>
          <div className={`${styles.scopeTrack} ${isMulti ? styles.scopeTrackOn : ''}`}>
            <div className={`${styles.scopeThumb} ${isMulti ? styles.scopeThumbOn : ''}`} />
          </div>
          <span className={`${styles.scopeLabel} ${isMulti ? styles.scopeLabelOn : ''}`}>
            Multinational
          </span>
        </div>

        {/* Reload */}
        <button
          className={`${styles.reload} ${reloading ? styles.busy : ''}`}
          onClick={onReload}
          disabled={reloading}
        >
          <span className={reloading ? styles.spinIcon : ''}>⟳</span>
          {reloading ? ' Reloading…' : ' Reload'}
        </button>

        {/* User */}
        <div className={styles.user}>
          <div className={styles.avatar}>AM</div>
          <div>
            <div className={styles.userName}>Alex Morgan</div>
            <div className={styles.userRole}>Account Director</div>
          </div>
        </div>

      </div>
    </nav>
  );
};

export default NavbarCiq;
