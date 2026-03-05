import type { RiskColor, ClientStatus } from '../models/claims/client.model';

/**
 * riskColor — maps ClientStatus to display colors.
 *
 * Per Marsh spec (Image 1):
 *   Stable      → Green
 *   Improving   → Yellow
 *   Drifting    → Purple
 *   Accelerating → Red
 *
 * Accepts either the new clientStatus string OR the legacy 0–100 riskScore number
 * for backward compatibility during migration.
 */
export function riskColor(input: ClientStatus | number): RiskColor {
  // ── Resolve status from legacy numeric riskScore if needed ──
  let status: ClientStatus;

  if (typeof input === 'number') {
    // Legacy path: map 0–100 score back to status
    // 0–33 → Stable, 34–63 → Drifting, 64+ → Accelerating
    if (input >= 64) status = 'Accelerating';
    else if (input >= 34) status = 'Drifting';
    else status = 'Stable';
  } else {
    status = input;
  }

  // ── Status → Colors ─────────────────────────────────────────
  switch (status) {
    case 'Accelerating':
      return {
        bg:     '#ffebee',
        border: '#ef9a9a',
        badge:  '#c62828',
        label:  'Accelerating',
        glow:   'rgba(198,40,40,.25)',
      };

    case 'Drifting':
      return {
        bg:     '#f3e5f5',
        border: '#ce93d8',
        badge:  '#7b1fa2',
        label:  'Drifting',
        glow:   'rgba(123,31,162,.25)',
      };

    case 'Improving':
      return {
        bg:     '#fffde7',
        border: '#fff176',
        badge:  '#f57f17',
        label:  'Improving',
        glow:   'rgba(245,127,23,.25)',
      };

    case 'Stable':
    default:
      return {
        bg:     '#e8f5e9',
        border: '#a5d6a7',
        badge:  '#2e7d32',
        label:  'Stable',
        glow:   'rgba(46,125,50,.25)',
      };
  }
}

/**
 * statusLabel — returns display label for a client status.
 * Used in badges and category tiles.
 */
export function statusLabel(c: { clientStatus?: ClientStatus; riskScore?: number; trendPct?: number }): ClientStatus {
  if (c.clientStatus) return c.clientStatus;
  // Fallback derivation from trendPct if neither is available
  if (c.trendPct !== undefined) {
    if (c.trendPct <= -5) return 'Improving';
    if (c.trendPct < 8)   return 'Stable';
    if (c.trendPct <= 15) return 'Drifting';
    return 'Accelerating';
  }
  return 'Stable';
}
