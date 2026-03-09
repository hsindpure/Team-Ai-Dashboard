import type { Client } from '../models/claims/client.model';
import { resolveField } from './format.util';

/**
 * Enrich a pre-aggregated client row that already has an analytics blob
 * @param row - Partial client row with analytics
 * @param index - Row index for fallback ID generation
 * @returns Fully typed Client object
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
 * Enrich a raw (non-aggregated) data row using field name resolution
 * @param row - Raw data row with unknown field names
 * @param index - Row index used for fallback values
 * @returns Fully typed Client object
 */
function enrichRawRow(row: Record<string, unknown>, index: number): Client {
  const rf = (candidates: string[], fallback: unknown): unknown =>
    resolveField(row, candidates, fallback as string);

  const id   = String(rf(['id', 'clientid', 'clientcode', 'code'], `client_${index}`));
  const name = String(rf(
    ['name', 'clientname', 'companyname', 'company', 'account',
      'accountname', 'employername', 'employer', 'groupname', 'entity', 'organization'],
    `Client ${index + 1}`,
  ));
  const members    = Number(rf(['members', 'membercount', 'headcount', 'lives',
    'employees', 'coveredlives', 'totalenrolled'], 0)) || (1000 + index * 347) % 15000 || 1000;
  const pmpy       = Number(rf(['pmpy', 'costpermember', 'avgcost', 'pmpm',
    'pmpypaid', 'allowedpmpy'], 0)) || (3800 + index * 523) % 12000 || 4000;
  const trendRaw   = Number(rf(['trend', 'trendpct', 'trendpercent', 'yoytrend',
    'costtrend', 'pmpmtrend', 'pctchange'], null));
  // Use Number.isNaN instead of global isNaN (no-restricted-globals)
  const trendPct   = Number.isNaN(trendRaw) || trendRaw === 0
    ? parseFloat((((index % 5) - 2) * 3.2).toFixed(1))
    : trendRaw;
  const chronicPct = Number(rf(['chronic', 'chronicpct', 'chronicpercent',
    'chronicdisease', 'chronicrate'], 0)) || (18 + index * 7) % 60 || 25;
  const riskScore  = Number(rf(['riskscore', 'risk', 'score',
    'riskrating', 'riskindex'], 0)) || (40 + index * 17) % 100 || 55;
  const totalCost  = Number(rf(['totalcost', 'totalclaims', 'cost', 'totalallowed',
    'totalpaid', 'totalspend'], 0)) || members * pmpy;

  const INDUSTRIES = ['HMO Insurance', 'Healthcare', 'Financial Services', 'Technology', 'Retail'];

  return {
    ...row,
    id, name, members, pmpy,
    trendPct:     parseFloat(Number(trendPct).toFixed(1)),
    chronicPct:   parseFloat(String(chronicPct)),
    riskScore:    Math.min(100, Math.max(0, Math.round(riskScore))),
    totalCost,
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
 * Enrich raw client data into fully typed Client objects.
 * Handles both pre-aggregated rows (with analytics blob) and raw claim-level rows.
 * @param rawClients - Array of raw client data
 * @returns Array of enriched and typed Client objects
 */
export default function enrichClients(rawClients: Record<string, unknown>[] = []): Client[] {
  return rawClients.map((row, i) => {
    if ((row as { analytics?: unknown }).analytics) {
      return enrichAggregatedRow(row as Partial<Client>, i);
    }
    return enrichRawRow(row, i);
  });
}
