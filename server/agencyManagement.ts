/**
 * Agency management — agencies, host assignment, scoped revenue.
 */

import { randomUUID } from 'crypto';
import type { Express, Request, Response } from 'express';

export type AgencyStatus = 'pending' | 'active' | 'suspended';

export type AgencyPermissions = {
  canViewRevenue: boolean;
  canManageHosts: boolean;
  canRequestPayout: boolean;
  canViewCalls: boolean;
  canMonitor: boolean;
};

export type Agency = {
  id: string;
  name: string;
  ownerName: string;
  email: string;
  phone?: string;
  country?: string;
  status: AgencyStatus;
  commissionPercent: number;
  hostIds: string[];
  permissions: AgencyPermissions;
  loginKey: string;
  revenueTotal: number;
  revenueMonth: number;
  createdAt: number;
  updatedAt: number;
};

const DEFAULT_PERMS: AgencyPermissions = {
  canViewRevenue: true,
  canManageHosts: true,
  canRequestPayout: false,
  canViewCalls: true,
  canMonitor: false,
};

const agencies = new Map<string, Agency>();
const hostAgency = new Map<string, string>(); // hostId -> agencyId

function seed() {
  if (agencies.size) return;
  const a1: Agency = {
    id: 'ag_nova',
    name: 'Nova Talent',
    ownerName: 'Sara Khan',
    email: 'sara@novatalent.demo',
    phone: '+92 300 1112233',
    country: 'PK',
    status: 'active',
    commissionPercent: 30,
    hostIds: [],
    permissions: { ...DEFAULT_PERMS, canRequestPayout: true },
    loginKey: 'agency-nova',
    revenueTotal: 128400,
    revenueMonth: 18600,
    createdAt: Date.now() - 86400000 * 40,
    updatedAt: Date.now(),
  };
  const a2: Agency = {
    id: 'ag_luxe',
    name: 'Luxe Creators',
    ownerName: 'Omar Riz',
    email: 'omar@luxecreators.demo',
    country: 'AE',
    status: 'active',
    commissionPercent: 25,
    hostIds: [],
    permissions: { ...DEFAULT_PERMS },
    loginKey: 'agency-luxe',
    revenueTotal: 94200,
    revenueMonth: 12400,
    createdAt: Date.now() - 86400000 * 22,
    updatedAt: Date.now(),
  };
  const a3: Agency = {
    id: 'ag_spark',
    name: 'Spark Agency',
    ownerName: 'Ayesha M',
    email: 'ayesha@spark.demo',
    country: 'PK',
    status: 'pending',
    commissionPercent: 35,
    hostIds: [],
    permissions: {
      canViewRevenue: true,
      canManageHosts: false,
      canRequestPayout: false,
      canViewCalls: false,
      canMonitor: false,
    },
    loginKey: 'agency-spark',
    revenueTotal: 0,
    revenueMonth: 0,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now(),
  };
  for (const a of [a1, a2, a3]) agencies.set(a.id, a);
}

seed();

export function listAgencies() {
  return [...agencies.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getAgency(id: string) {
  return agencies.get(id);
}

export function findAgencyByLoginKey(key: string) {
  return listAgencies().find((a) => a.loginKey === key);
}

export function getAgencyIdForHost(hostId: string) {
  return hostAgency.get(hostId) || null;
}

export function publicAgency(a: Agency) {
  const { loginKey: _k, ...rest } = a;
  return rest;
}

type Ctx = {
  requireAdmin: (req: Request, res: Response) => boolean;
  getHostRevenueSnapshot: () => {
    hostId: string;
    name: string;
    revenueGenerated: number;
    pendingEarnings: number;
    paidEarnings: number;
    type: 'agency' | 'individual';
    agencyId?: string;
    agencyName?: string;
  }[];
};

export function registerAgencyRoutes(app: Express, ctx: Ctx) {
  app.get('/api/admin/agencies', (req, res) => {
    if (!ctx.requireAdmin(req, res)) return;
    res.json({
      agencies: listAgencies().map(publicAgency),
      count: agencies.size,
    });
  });

  app.post('/api/admin/agencies', (req, res) => {
    if (!ctx.requireAdmin(req, res)) return;
    const name = String(req.body?.name || '').trim();
    const ownerName = String(req.body?.ownerName || '').trim();
    const email = String(req.body?.email || '').trim();
    if (!name || !ownerName || !email) {
      res.status(400).json({ error: 'name, ownerName, email required' });
      return;
    }
    const id = `ag_${randomUUID().slice(0, 8)}`;
    const row: Agency = {
      id,
      name,
      ownerName,
      email,
      phone: String(req.body?.phone || '').trim() || undefined,
      country: String(req.body?.country || '').trim() || undefined,
      status: (req.body?.status as AgencyStatus) || 'pending',
      commissionPercent: Math.min(
        80,
        Math.max(5, Number(req.body?.commissionPercent) || 30),
      ),
      hostIds: [],
      permissions: {
        ...DEFAULT_PERMS,
        ...(req.body?.permissions || {}),
      },
      loginKey: String(req.body?.loginKey || `agency-${id.slice(3)}`),
      revenueTotal: 0,
      revenueMonth: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    agencies.set(id, row);
    res.json({ ok: true, agency: publicAgency(row), loginKey: row.loginKey });
  });

  app.post('/api/admin/agencies/:id', (req, res) => {
    if (!ctx.requireAdmin(req, res)) return;
    const row = agencies.get(String(req.params.id));
    if (!row) {
      res.status(404).json({ error: 'Agency not found' });
      return;
    }
    if (req.body?.name) row.name = String(req.body.name);
    if (req.body?.ownerName) row.ownerName = String(req.body.ownerName);
    if (req.body?.email) row.email = String(req.body.email);
    if (req.body?.phone !== undefined) row.phone = String(req.body.phone || '');
    if (req.body?.country !== undefined)
      row.country = String(req.body.country || '');
    if (req.body?.status) row.status = req.body.status as AgencyStatus;
    if (req.body?.commissionPercent != null) {
      row.commissionPercent = Math.min(
        80,
        Math.max(5, Number(req.body.commissionPercent)),
      );
    }
    if (req.body?.permissions) {
      row.permissions = { ...row.permissions, ...req.body.permissions };
    }
    if (req.body?.loginKey) row.loginKey = String(req.body.loginKey);
    row.updatedAt = Date.now();
    agencies.set(row.id, row);
    res.json({ ok: true, agency: publicAgency(row) });
  });

  app.post('/api/admin/agencies/:id/hosts', (req, res) => {
    if (!ctx.requireAdmin(req, res)) return;
    const row = agencies.get(String(req.params.id));
    if (!row) {
      res.status(404).json({ error: 'Agency not found' });
      return;
    }
    const hostId = String(req.body?.hostId || '').trim();
    const action = String(req.body?.action || 'assign');
    if (!hostId) {
      res.status(400).json({ error: 'hostId required' });
      return;
    }
    if (action === 'remove') {
      row.hostIds = row.hostIds.filter((h) => h !== hostId);
      hostAgency.delete(hostId);
    } else {
      const prev = hostAgency.get(hostId);
      if (prev && prev !== row.id) {
        const other = agencies.get(prev);
        if (other) {
          other.hostIds = other.hostIds.filter((h) => h !== hostId);
          other.updatedAt = Date.now();
        }
      }
      if (!row.hostIds.includes(hostId)) row.hostIds.push(hostId);
      hostAgency.set(hostId, row.id);
    }
    row.updatedAt = Date.now();
    agencies.set(row.id, row);
    res.json({ ok: true, agency: publicAgency(row) });
  });

  app.post('/api/admin/agency-login', (req, res) => {
    const key = String(req.body?.key || '').trim();
    const agency = findAgencyByLoginKey(key);
    if (!agency || agency.status === 'suspended') {
      res.status(401).json({ ok: false, error: 'Invalid agency key' });
      return;
    }
    res.json({
      ok: true,
      role: 'agency',
      agencyId: agency.id,
      agency: publicAgency(agency),
      permissions: agency.permissions,
    });
  });

  app.get('/api/admin/revenue', (req, res) => {
    if (!ctx.requireAdmin(req, res)) return;
    const agencyId = String(req.query.agencyId || '').trim();
    const snapshot = ctx.getHostRevenueSnapshot();
    let rows = snapshot;
    if (agencyId) {
      rows = snapshot.filter((r) => r.agencyId === agencyId);
    }
    const agencyRev = listAgencies().map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      commissionPercent: a.commissionPercent,
      hostCount: a.hostIds.length,
      revenueTotal: a.revenueTotal,
      revenueMonth: a.revenueMonth,
      agencyShare: Math.round((a.revenueMonth * a.commissionPercent) / 100),
      platformShare: Math.round(
        (a.revenueMonth * (100 - a.commissionPercent)) / 100,
      ),
    }));
    const individual = rows.filter((r) => r.type === 'individual');
    const agencyHosts = rows.filter((r) => r.type === 'agency');
    const sum = (list: typeof rows) =>
      list.reduce((s, r) => s + (r.revenueGenerated || 0), 0);
    res.json({
      totals: {
        allHosts: sum(rows),
        agencyHosts: sum(agencyHosts),
        individualHosts: sum(individual),
        agenciesMonth: agencyRev.reduce((s, a) => s + a.revenueMonth, 0),
      },
      agencies: agencyRev,
      hosts: rows,
    });
  });

  app.get('/api/admin/host-types', (req, res) => {
    if (!ctx.requireAdmin(req, res)) return;
    const agencyId = String(req.query.agencyId || '').trim();
    const snapshot = ctx.getHostRevenueSnapshot();
    let agency = snapshot.filter((h) => h.type === 'agency');
    const individual = snapshot.filter((h) => h.type === 'individual');
    if (agencyId) {
      agency = agency.filter((h) => h.agencyId === agencyId);
    }
    res.json({ agency, individual });
  });

  /** Agency ledger — scoped hosts with live-friendly earnings fields */
  app.get('/api/admin/agency-ledger', (req, res) => {
    if (!ctx.requireAdmin(req, res)) return;
    const agencyId = String(req.query.agencyId || '').trim();
    if (!agencyId) {
      res.status(400).json({ error: 'agencyId required' });
      return;
    }
    const agency = getAgency(agencyId);
    if (!agency) {
      res.status(404).json({ error: 'Agency not found' });
      return;
    }
    const snapshot = ctx.getHostRevenueSnapshot().filter(
      (h) => h.agencyId === agencyId,
    );
    res.json({
      agency: publicAgency(agency),
      hosts: snapshot,
      totals: {
        hosts: snapshot.length,
        revenue: snapshot.reduce((s, h) => s + (h.revenueGenerated || 0), 0),
        pending: snapshot.reduce((s, h) => s + (h.pendingEarnings || 0), 0),
        paid: snapshot.reduce((s, h) => s + (h.paidEarnings || 0), 0),
      },
    });
  });
}

/** Attach demo hosts to seed agencies when host registry is known */
export function linkDemoHostsIfEmpty(
  hostIds: string[],
) {
  const nova = agencies.get('ag_nova');
  const luxe = agencies.get('ag_luxe');
  if (!nova || !luxe) return;
  if (nova.hostIds.length || luxe.hostIds.length) return;
  const ids = hostIds.slice(0, 6);
  ids.forEach((id, i) => {
    const target = i % 2 === 0 ? nova : luxe;
    target.hostIds.push(id);
    hostAgency.set(id, target.id);
  });
  nova.updatedAt = Date.now();
  luxe.updatedAt = Date.now();
}
