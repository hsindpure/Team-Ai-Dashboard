import type { Client } from '../models/claims/client.model';
import { resolveField } from './format.util';

export function enrichClients(rawClients: Record<string, unknown>[] = []): Client[] {
  return rawClients.map((row, i) => {
    if ((row as { analytics?: unknown }).analytics) {
      const r = row as Partial<Client>;
      return {
        ...r,
        id:               String(r.id          ?? `client_${i}`),
        name:             String(r.name        ?? `Client ${i + 1}`),
        members:          Number(r.members     ?? 0),
        pmpy:             Number(r.pmpy        ?? 0),
        trendPct:         parseFloat(String(r.trendPct  ?? 0)),
        chronicPct:       parseFloat(String(r.chronicPct ?? 0)),
        riskScore:        Math.min(100, Math.max(0, Math.round(Number(r.riskScore ?? 0)))),
        compositeScore:   r.compositeScore != null ? Number(r.compositeScore) : undefined,
        clientStatus:     r.clientStatus   ?? undefined,
        compositeBreakdown: r.compositeBreakdown ?? undefined,
        totalCost:        Number(r.totalCost   ?? 0),
        industry:         String(r.industry    ?? 'HMO / Corporate Health'),
        country:          String(r.country     ?? 'Philippines'),
        currency:         String(r.currency    ?? '₱'),
        meetingDate:      String(r.meetingDate ?? ''),
        manager:          String(r.manager     ?? ''),
        renewalDate:      String(r.renewalDate ?? ''),
        renewalOverdue:   Boolean(r.renewalOverdue),
      } as Client;
    }

    const id   = String(resolveField(row, ['id','clientid','clientcode','code'], `client_${i}`));
    const name = String(resolveField(row, ['name','clientname','companyname','company','account','accountname','employername','employer','groupname','entity','organization'], `Client ${i + 1}`));
    const members = Number(resolveField(row, ['members','membercount','headcount','lives','employees','coveredlives','totalenrolled'], 0)) || (1000 + i * 347) % 15000 || 1000;
    const pmpy    = Number(resolveField(row, ['pmpy','costpermember','avgcost','pmpm','pmpypaid','allowedpmpy'], 0)) || (3800 + i * 523) % 12000 || 4000;
    const trendRaw = Number(resolveField(row, ['trend','trendpct','trendpercent','yoytrend','costtrend','pmpmtrend','pctchange'], null) as number);
    const trendPct = isNaN(trendRaw) || trendRaw === 0 ? parseFloat((((i % 5) - 2) * 3.2).toFixed(1)) : trendRaw;
    const chronicPct = Number(resolveField(row, ['chronic','chronicpct','chronicpercent','chronicdisease','chronicrate'], 0)) || (18 + i * 7) % 60 || 25;
    const riskScore  = Number(resolveField(row, ['riskscore','risk','score','riskrating','riskindex'], 0)) || (40 + i * 17) % 100 || 55;
    const totalCost  = Number(resolveField(row, ['totalcost','totalclaims','cost','totalallowed','totalpaid','totalspend'], 0)) || members * pmpy;
    const industry   = String(resolveField(row, ['industry','sector','businesstype'], ''));
    const country    = String(resolveField(row, ['country','region','location','state'], ''));
    const meetingDate = String(resolveField(row, ['meetingdate','nextmeeting','meeting'], ''));
    const manager    = String(resolveField(row, ['manager','accountmanager','am','consultant'], ''));
    const renewalDate = String(resolveField(row, ['renewaldate','renewal','expirydate'], ''));
    const renewalOverdueRaw = resolveField(row, ['renewaloverdue','overdue','renewalstatus'], null);
    const renewalOverdue    = renewalOverdueRaw !== null ? Boolean(renewalOverdueRaw) : i % 4 === 2;

    return {
      ...row,
      id, name, members, pmpy,
      trendPct:     parseFloat(Number(trendPct).toFixed(1)),
      chronicPct:   parseFloat(String(chronicPct)),
      riskScore:    Math.min(100, Math.max(0, Math.round(riskScore))),
      totalCost,
      industry:     industry  || ['HMO Insurance','Healthcare','Financial Services','Technology','Retail'][i % 5],
      country:      country   || 'Philippines',
      currency:     '₱',
      meetingDate, manager, renewalDate, renewalOverdue,
    } as Client;
  });
}
