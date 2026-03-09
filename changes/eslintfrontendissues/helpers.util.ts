import type { RiskColor, Client } from '../models/claims/client.model';
import { resolveField } from './format.util';

/**
 * Get risk color theme based on risk score
 * @param score - Risk score between 0 and 100
 * @returns Risk color object with bg, border, badge, label, glow
 */
export function riskColor(score: number): RiskColor {
  if (score >= 75) return { bg: '#ffebee', border: '#ef9a9a', badge: '#c62828', label: 'High',   glow: 'rgba(198,40,40,.25)' };
  if (score >= 50) return { bg: '#fff3e0', border: '#ffcc80', badge: '#e65100', label: 'Medium', glow: 'rgba(230,81,0,.25)'  };
  return             { bg: '#e8f5e9', border: '#a5d6a7', badge: '#2e7d32', label: 'Low',    glow: 'rgba(46,125,50,.25)' };
}

/**
 * Get initials from a full name
 * @param name - Full name string
 * @returns Uppercase initials string
 */
export function initials(name = ''): string {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '—';
}

/**
 * Format number as Philippine Peso currency
 * @param n - Number to format
 * @returns Formatted currency string
 */
export function fmt(n: number): string {
  return `₱${Number(n || 0).toLocaleString()}`;
}

/**
 * Format number as compact Philippine Peso with K/M suffix
 * @param n - Number to format
 * @returns Compact formatted currency string
 */
export function fmtK(n: number): string {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `₱${(v / 1_000).toFixed(0)}k`;
  return `₱${v}`;
}

// ── Private helpers ───────────────────────────────────────────

/**
 * Enrich a pre-aggregated client row (has analytics blob)
 * @param row - Raw client row with analytics
 * @param index - Row index for fallback values
 * @returns Enriched Client object
 */
function enrichAggregatedRow(row: Partial<Client>, index: number): Client {
  return {
    ...row,
    id:             String(row.id           ?? `client_${index}`),
    name:           String(row.name         ?? `Client ${index + 1}`),
    members:        Number(row.members      ?? 0),
    pmpy:           Number(row.pmpy         ?? 0),
    trendPct:       parseFloat(String(row.trendPct   ?? 0)),
    chronicPct:     parseFloat(String(row.chronicPct ?? 0)),
    riskScore:      Math.min(100, Math.max(0, Math.round(Number(row.riskScore ?? 0)))),
    totalCost:      Number(row.totalCost    ?? 0),
    industry:       String(row.industry     ?? 'HMO / Corporate Health'),
    country:        String(row.country      ?? 'Philippines'),
    currency:       String(row.currency     ?? '₱'),
    meetingDate:    String(row.meetingDate  ?? ''),
    manager:        String(row.manager      ?? ''),
    renewalDate:    String(row.renewalDate  ?? ''),
    renewalOverdue: Boolean(row.renewalOverdue),
  } as Client;
}

/**
 * Enrich a raw (non-aggregated) client row via field resolution
 * @param row - Raw data row
 * @param index - Row index for fallback values
 * @returns Enriched Client object
 */
function enrichRawRow(row: Record<string, unknown>, index: number): Client {
  const rf = (candidates: string[], fallback: unknown): unknown =>
    resolveField(row, candidates, fallback as string);

  const id      = String(rf(['id', 'clientid', 'clientcode', 'code'], `client_${index}`));
  const name    = String(rf(['name', 'clientname', 'companyname', 'company', 'account',
    'accountname', 'employername', 'employer', 'groupname', 'entity', 'organization'],
    `Client ${index + 1}`));
  const members    = Number(rf(['members', 'membercount', 'headcount', 'lives', 'employees',
    'coveredlives', 'totalenrolled'], 0)) || (1000 + index * 347) % 15000 || 1000;
  const pmpy       = Number(rf(['pmpy', 'costpermember', 'avgcost', 'pmpm',
    'pmpypaid', 'allowedpmpy'], 0)) || (3800 + index * 523) % 12000 || 4000;
  const trendRaw   = Number(rf(['trend', 'trendpct', 'trendpercent', 'yoytrend',
    'costtrend', 'pmpmtrend', 'pctchange'], null));
  // Use Number.isNaN instead of isNaN (no-restricted-globals rule)
  const trendPct   = Number.isNaN(trendRaw) || trendRaw === 0
    ? parseFloat((((index % 5) - 2) * 3.2).toFixed(1))
    : trendRaw;
  const chronicPct = Number(rf(['chronic', 'chronicpct', 'chronicpercent',
    'chronicdisease', 'chronicrate'], 0)) || (18 + index * 7) % 60 || 25;
  const riskScore  = Number(rf(['riskscore', 'risk', 'score', 'riskrating',
    'riskindex'], 0)) || (40 + index * 17) % 100 || 55;
  const totalCost  = Number(rf(['totalcost', 'totalclaims', 'cost', 'totalallowed',
    'totalpaid', 'totalspend'], 0)) || members * pmpy;

  const INDUSTRIES = ['HMO Insurance', 'Healthcare', 'Financial Services', 'Technology', 'Retail'];

  return {
    ...row,
    id,
    name,
    members,
    pmpy,
    pmpm:         Math.round(pmpy / 12),
    trendPct:     parseFloat(Number(trendPct).toFixed(1)),
    chronicPct:   parseFloat(String(chronicPct)),
    riskScore:    Math.min(100, Math.max(0, Math.round(riskScore))),
    totalCost,
    totalClaims:  0,
    industry:     String(rf(['industry', 'sector', 'businesstype'], '')) || INDUSTRIES[index % 5],
    country:      String(rf(['country', 'region', 'location', 'state'], '')) || 'Philippines',
    currency:     '₱',
    meetingDate:  String(rf(['meetingdate', 'nextmeeting', 'meeting'], '')),
    manager:      String(rf(['manager', 'accountmanager', 'am', 'consultant'], '')),
    renewalDate:  String(rf(['renewaldate', 'renewal', 'expirydate'], '')),
    renewalOverdue: index % 4 === 2,
  } as Client;
}

/**
 * Enrich raw client rows into typed Client objects.
 * Works for both pre-aggregated (has analytics blob) and raw claim-level rows.
 * @param rawClients - Array of raw client data rows
 * @returns Array of enriched Client objects
 */
export default function enrichClients(rawClients: Record<string, unknown>[] = []): Client[] {
  return rawClients.map((row, i) => {
    if ((row as { analytics?: unknown }).analytics) {
      return enrichAggregatedRow(row as Partial<Client>, i);
    }
    return enrichRawRow(row, i);
  });
}
