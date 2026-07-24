/**
 * Agency management — shared Agency Panel (same SPA as admin).
 * Auth: agency loginKey binds identity server-side (never trust client agencyId alone).
 */

import { randomUUID, createHash } from 'crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import {
  hashPassword,
  issueStaffToken,
  requestStaffToken,
  strongPassword,
  validEmail,
  verifyPassword,
  verifyStaffToken,
} from './staffAuth.ts';

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
  address?: string;
  nationalId?: string;
  passportNumber?: string;
  passportDocument?: string;
  passportDocumentName?: string;
  status: AgencyStatus;
  commissionPercent: number;
  hostIds: string[];
  permissions: AgencyPermissions;
  /** Portal secret — never returned in publicAgency */
  loginKey: string;
  /** Password verifier only; plaintext is never stored */
  passwordHash?: string;
  referralCode: string;
  /** Host app join deep-link base is applied when serializing */
  minWithdrawCoins: number;
  maxWithdrawCoins: number;
  dailyWithdrawCap: number;
  revenueTotal: number;
  revenueMonth: number;
  /** Referral funnel */
  inviteClicks: number;
  inviteJoins: number;
  createdAt: number;
  updatedAt: number;
};

export type AgencyAnnouncement = {
  id: string;
  title: string;
  body: string;
  /** empty = all agencies */
  agencyIds: string[];
  createdAt: number;
  createdBy: string;
};

export type AgencyAuthContext = {
  kind: 'admin' | 'agency';
  agency?: Agency;
};

const DEFAULT_PERMS: AgencyPermissions = {
  canViewRevenue: true,
  canManageHosts: true,
  canRequestPayout: false,
  canViewCalls: true,
  canMonitor: false,
};

const HOST_APP_JOIN_BASE =
  process.env.HOST_APP_PUBLIC_URL ||
  process.env.COINCALL_HOST_URL ||
  'https://coincall-host.onrender.com';

const agencies = new Map<string, Agency>();
const hostAgency = new Map<string, string>(); // hostId -> agencyId
const announcements: AgencyAnnouncement[] = [];
const agencyAuthByReq = new WeakMap<Request, AgencyAuthContext>();

function seed() {
  if (agencies.size) return;
  const mk = (
    partial: Omit<Agency, 'referralCode' | 'minWithdrawCoins' | 'maxWithdrawCoins' | 'dailyWithdrawCap' | 'inviteClicks' | 'inviteJoins'> &
      Partial<Agency>,
  ): Agency => ({
    minWithdrawCoins: 500,
    maxWithdrawCoins: 50000,
    dailyWithdrawCap: 100000,
    inviteClicks: 0,
    inviteJoins: 0,
    referralCode: partial.referralCode || makeReferralCode(partial.name),
    ...partial,
  });

  const a1 = mk({
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
    referralCode: 'NOVA30',
    revenueTotal: 128400,
    revenueMonth: 18600,
    createdAt: Date.now() - 86400000 * 40,
    updatedAt: Date.now(),
  });
  const a2 = mk({
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
    referralCode: 'LUXE25',
    revenueTotal: 94200,
    revenueMonth: 12400,
    createdAt: Date.now() - 86400000 * 22,
    updatedAt: Date.now(),
  });
  const a3 = mk({
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
    referralCode: 'SPARK35',
    revenueTotal: 0,
    revenueMonth: 0,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now(),
  });
  for (const a of [a1, a2, a3]) agencies.set(a.id, a);
}

if (process.env.SEED_DEMO_AGENCIES === 'true') seed();

function makeReferralCode(name: string) {
  const base = String(name || 'AG')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6)
    .toUpperCase();
  const suffix = randomUUID().slice(0, 4).toUpperCase();
  let code = `${base || 'AG'}${suffix}`;
  while ([...agencies.values()].some((a) => a.referralCode === code)) {
    code = `${base || 'AG'}${randomUUID().slice(0, 4).toUpperCase()}`;
  }
  return code;
}

function referralLinkFor(code: string) {
  return `${HOST_APP_JOIN_BASE.replace(/\/$/, '')}/#/join?ref=${encodeURIComponent(code)}`;
}

export function listAgencies() {
  return [...agencies.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getAgency(id: string) {
  return agencies.get(id);
}

export function findAgencyByLoginKey(key: string) {
  const k = String(key || '').trim();
  if (!k) return undefined;
  return listAgencies().find((a) => a.loginKey === k);
}

export function findAgencyByReferralCode(code: string) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return undefined;
  return listAgencies().find((a) => a.referralCode === c);
}

export function getAgencyIdForHost(hostId: string) {
  return hostAgency.get(hostId) || null;
}

export function getAgencyAuth(req: Request): AgencyAuthContext | undefined {
  return agencyAuthByReq.get(req);
}

/** Roll host earnings into the linked agency ledger */
export function creditAgencyRevenue(hostId: string, amount: number) {
  const n = Math.floor(Number(amount) || 0);
  if (!hostId || n <= 0) return null;
  const agencyId = hostAgency.get(hostId);
  if (!agencyId) return null;
  const agency = agencies.get(agencyId);
  if (!agency) return null;
  agency.revenueTotal = (agency.revenueTotal || 0) + n;
  agency.revenueMonth = (agency.revenueMonth || 0) + n;
  agency.updatedAt = Date.now();
  agencies.set(agencyId, agency);
  return agency;
}

export function publicAgency(a: Agency) {
  const { loginKey: _k, passwordHash: _passwordHash, ...rest } = a;
  return {
    ...rest,
    referralLink: referralLinkFor(a.referralCode),
    hostCount: a.hostIds.length,
  };
}

export function dumpAgenciesForSnapshot() {
  return {
    agencies: listAgencies() as unknown as Array<Record<string, unknown>>,
    hostAgency: [...hostAgency.entries()].map(([hostId, agencyId]) => ({
      hostId,
      agencyId,
    })),
    announcements: announcements as unknown as Array<Record<string, unknown>>,
  };
}

export function loadAgenciesFromSnapshot(snap: {
  agencies?: Array<Record<string, unknown>>;
  hostAgency?: Array<{ hostId?: string; agencyId?: string }>;
  announcements?: Array<Record<string, unknown>>;
}) {
  if (Array.isArray(snap.agencies) && snap.agencies.length) {
    agencies.clear();
    for (const raw of snap.agencies) {
      const a = raw as unknown as Agency;
      if (!a?.id) continue;
      agencies.set(a.id, {
        minWithdrawCoins: 500,
        maxWithdrawCoins: 50000,
        dailyWithdrawCap: 100000,
        inviteClicks: 0,
        inviteJoins: 0,
        referralCode: a.referralCode || makeReferralCode(a.name || a.id),
        ...a,
        hostIds: Array.isArray(a.hostIds) ? a.hostIds.map(String) : [],
        permissions: { ...DEFAULT_PERMS, ...(a.permissions || {}) },
      });
    }
  }
  if (Array.isArray(snap.hostAgency)) {
    hostAgency.clear();
    for (const row of snap.hostAgency) {
      const hid = String(row.hostId || '').trim();
      const aid = String(row.agencyId || '').trim();
      if (hid && aid) hostAgency.set(hid, aid);
    }
  }
  if (Array.isArray(snap.announcements)) {
    announcements.length = 0;
    announcements.push(
      ...(snap.announcements as unknown as AgencyAnnouncement[]),
    );
  }
}

function assignHost(agencyId: string, hostId: string) {
  const row = agencies.get(agencyId);
  if (!row) return null;
  const prev = hostAgency.get(hostId);
  if (prev && prev !== agencyId) {
    const other = agencies.get(prev);
    if (other) {
      other.hostIds = other.hostIds.filter((h) => h !== hostId);
      other.updatedAt = Date.now();
    }
  }
  if (!row.hostIds.includes(hostId)) row.hostIds.push(hostId);
  hostAgency.set(hostId, agencyId);
  row.updatedAt = Date.now();
  agencies.set(row.id, row);
  return row;
}

function removeHost(agencyId: string, hostId: string) {
  const row = agencies.get(agencyId);
  if (!row) return null;
  row.hostIds = row.hostIds.filter((h) => h !== hostId);
  if (hostAgency.get(hostId) === agencyId) hostAgency.delete(hostId);
  row.updatedAt = Date.now();
  agencies.set(row.id, row);
  return row;
}

type Ctx = {
  /** Platform admin master key only */
  isPlatformAdmin: (req: Request) => boolean;
  /** Platform admin OR valid agency key — sets agency auth on req */
  requireStaff: (req: Request, res: Response) => boolean;
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
  onPersist?: () => void;
  notifyHosts?: (
    hostIds: string[],
    msg: { title: string; body: string; kind?: string },
  ) => void;
};

/**
 * Bind agency identity from login key header.
 * Call from index requireStaff before route handlers.
 */
export function resolveStaffAuth(
  req: Request,
  adminKey: string,
): AgencyAuthContext | null {
  const key = requestStaffToken(req);
  if (!key) return null;
  const token = verifyStaffToken(key);
  if (token?.kind === 'admin') {
    const ctx: AgencyAuthContext = { kind: 'admin' };
    agencyAuthByReq.set(req, ctx);
    return ctx;
  }
  if (token?.kind === 'agency') {
    const agency = getAgency(token.agencyId);
    if (!agency || agency.status !== 'active') return null;
    const ctx: AgencyAuthContext = { kind: 'agency', agency };
    agencyAuthByReq.set(req, ctx);
    return ctx;
  }
  if (key === adminKey) {
    const ctx: AgencyAuthContext = { kind: 'admin' };
    agencyAuthByReq.set(req, ctx);
    return ctx;
  }
  const agency = findAgencyByLoginKey(key);
  if (!agency || agency.status !== 'active') return null;
  const ctx: AgencyAuthContext = { kind: 'agency', agency };
  agencyAuthByReq.set(req, ctx);
  return ctx;
}

/** Force agencyId query/body to the authenticated agency */
function scopedAgencyId(req: Request, requested?: string): string | undefined {
  const auth = getAgencyAuth(req);
  if (auth?.kind === 'agency' && auth.agency) return auth.agency.id;
  return requested ? String(requested).trim() : undefined;
}

export function registerAgencyRoutes(app: Express, ctx: Ctx) {
  const persist = () => ctx.onPersist?.();

  app.get('/api/admin/agencies', (req, res) => {
    if (!ctx.requireStaff(req, res)) return;
    const auth = getAgencyAuth(req);
    if (auth?.kind === 'agency' && auth.agency) {
      res.json({
        agencies: [publicAgency(auth.agency)],
        count: 1,
      });
      return;
    }
    if (!ctx.isPlatformAdmin(req)) {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    res.json({
      agencies: listAgencies().map(publicAgency),
      count: agencies.size,
    });
  });

  app.post('/api/admin/agencies', (req, res) => {
    if (!ctx.requireStaff(req, res) || !ctx.isPlatformAdmin(req)) {
      if (!res.headersSent) res.status(403).json({ error: 'Admin only' });
      return;
    }
    const name = String(req.body?.name || '').trim();
    const ownerName = String(req.body?.ownerName || '').trim();
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!name || !ownerName || !validEmail(email) || !strongPassword(password)) {
      res.status(400).json({
        error:
          'Valid name, owner, email and a 12+ character password with upper/lowercase, number and symbol are required',
      });
      return;
    }
    if (listAgencies().some((a) => a.email.toLowerCase() === email.toLowerCase())) {
      res.status(409).json({ error: 'Agency email already in use' });
      return;
    }
    const id = `ag_${randomUUID().slice(0, 8)}`;
    const referralCode =
      String(req.body?.referralCode || '').trim().toUpperCase() ||
      makeReferralCode(name);
    if (findAgencyByReferralCode(referralCode)) {
      res.status(409).json({ error: 'Referral code already in use' });
      return;
    }
    const row: Agency = {
      id,
      name,
      ownerName,
      email,
      phone: String(req.body?.phone || '').trim() || undefined,
      country: String(req.body?.country || '').trim() || undefined,
      address: String(req.body?.address || '').trim() || undefined,
      nationalId: String(req.body?.nationalId || '').trim() || undefined,
      passportNumber:
        String(req.body?.passportNumber || '').trim() || undefined,
      passportDocument:
        String(req.body?.passportDocument || '').trim() || undefined,
      passportDocumentName:
        String(req.body?.passportDocumentName || '').trim() || undefined,
      status: (req.body?.status as AgencyStatus) || 'active',
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
      passwordHash: hashPassword(password),
      referralCode,
      minWithdrawCoins: Math.max(
        100,
        Math.floor(Number(req.body?.minWithdrawCoins) || 500),
      ),
      maxWithdrawCoins: Math.max(
        100,
        Math.floor(Number(req.body?.maxWithdrawCoins) || 50000),
      ),
      dailyWithdrawCap: Math.max(
        100,
        Math.floor(Number(req.body?.dailyWithdrawCap) || 100000),
      ),
      revenueTotal: 0,
      revenueMonth: 0,
      inviteClicks: 0,
      inviteJoins: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    agencies.set(id, row);
    persist();
    res.json({
      ok: true,
      agency: publicAgency(row),
      email: row.email,
      referralCode: row.referralCode,
      referralLink: referralLinkFor(row.referralCode),
    });
  });

  app.post('/api/admin/agencies/:id', (req, res) => {
    if (!ctx.requireStaff(req, res) || !ctx.isPlatformAdmin(req)) {
      if (!res.headersSent) res.status(403).json({ error: 'Admin only' });
      return;
    }
    const row = agencies.get(String(req.params.id));
    if (!row) {
      res.status(404).json({ error: 'Agency not found' });
      return;
    }
    if (req.body?.name) row.name = String(req.body.name);
    if (req.body?.ownerName) row.ownerName = String(req.body.ownerName);
    if (req.body?.email) row.email = String(req.body.email);
    if (req.body?.password !== undefined) {
      const password = String(req.body.password || '');
      if (!strongPassword(password)) {
        res.status(400).json({ error: 'Password does not meet security requirements' });
        return;
      }
      row.passwordHash = hashPassword(password);
    }
    if (req.body?.phone !== undefined) row.phone = String(req.body.phone || '');
    if (req.body?.country !== undefined)
      row.country = String(req.body.country || '');
    if (req.body?.address !== undefined)
      row.address = String(req.body.address || '');
    if (req.body?.nationalId !== undefined)
      row.nationalId = String(req.body.nationalId || '');
    if (req.body?.passportNumber !== undefined)
      row.passportNumber = String(req.body.passportNumber || '');
    if (req.body?.passportDocument !== undefined)
      row.passportDocument = String(req.body.passportDocument || '');
    if (req.body?.passportDocumentName !== undefined)
      row.passportDocumentName = String(req.body.passportDocumentName || '');
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
    if (req.body?.referralCode) {
      const code = String(req.body.referralCode).trim().toUpperCase();
      const clash = findAgencyByReferralCode(code);
      if (clash && clash.id !== row.id) {
        res.status(409).json({ error: 'Referral code already in use' });
        return;
      }
      row.referralCode = code;
    }
    if (req.body?.minWithdrawCoins != null) {
      row.minWithdrawCoins = Math.max(
        100,
        Math.floor(Number(req.body.minWithdrawCoins) || 500),
      );
    }
    if (req.body?.maxWithdrawCoins != null) {
      row.maxWithdrawCoins = Math.max(
        row.minWithdrawCoins,
        Math.floor(Number(req.body.maxWithdrawCoins) || 50000),
      );
    }
    if (req.body?.dailyWithdrawCap != null) {
      row.dailyWithdrawCap = Math.max(
        row.minWithdrawCoins,
        Math.floor(Number(req.body.dailyWithdrawCap) || 100000),
      );
    }
    row.updatedAt = Date.now();
    agencies.set(row.id, row);
    persist();
    res.json({ ok: true, agency: publicAgency(row) });
  });

  app.delete('/api/admin/agencies/:id', (req, res) => {
    if (!ctx.requireStaff(req, res) || !ctx.isPlatformAdmin(req)) {
      if (!res.headersSent) res.status(403).json({ error: 'Admin only' });
      return;
    }
    const id = String(req.params.id);
    const row = agencies.get(id);
    if (!row) {
      res.status(404).json({ error: 'Agency not found' });
      return;
    }
    for (const hid of [...row.hostIds]) {
      if (hostAgency.get(hid) === id) hostAgency.delete(hid);
    }
    agencies.delete(id);
    persist();
    res.json({ ok: true, deleted: id });
  });

  app.post('/api/admin/agencies/:id/hosts', (req, res) => {
    if (!ctx.requireStaff(req, res)) return;
    const auth = getAgencyAuth(req);
    const id = String(req.params.id);
    if (auth?.kind === 'agency' && auth.agency?.id !== id) {
      res.status(403).json({ error: 'Cannot manage another agency' });
      return;
    }
    if (auth?.kind === 'agency' && !auth.agency?.permissions.canManageHosts) {
      res.status(403).json({ error: 'Host management not allowed' });
      return;
    }
    if (auth?.kind === 'admin' && !ctx.isPlatformAdmin(req)) {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    const row = agencies.get(id);
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
    const next =
      action === 'remove' ? removeHost(id, hostId) : assignHost(id, hostId);
    persist();
    res.json({ ok: true, agency: publicAgency(next || row) });
  });

  app.post('/api/admin/agency-login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const agency = listAgencies().find(
      (a) => a.email.toLowerCase() === email,
    );
    if (!agency || agency.status !== 'active') {
      res.status(401).json({
        ok: false,
        error:
          agency?.status === 'pending'
            ? 'Agency pending activation'
            : 'Invalid email or password',
      });
      return;
    }
    if (!agency.passwordHash || !verifyPassword(password, agency.passwordHash)) {
      res.status(401).json({ ok: false, error: 'Invalid email or password' });
      return;
    }
    res.json({
      ok: true,
      token: issueStaffToken({ kind: 'agency', agencyId: agency.id }),
      role: 'agency',
      agencyId: agency.id,
      agency: publicAgency(agency),
      permissions: agency.permissions,
    });
  });

  /** Public: track referral link open */
  app.post('/api/agency/referral/click', (req, res) => {
    const code = String(req.body?.referralCode || req.query.ref || '').trim();
    const agency = findAgencyByReferralCode(code);
    if (!agency || agency.status !== 'active') {
      res.status(404).json({ error: 'Invalid referral' });
      return;
    }
    agency.inviteClicks += 1;
    agency.updatedAt = Date.now();
    persist();
    res.json({
      ok: true,
      agencyId: agency.id,
      agencyName: agency.name,
      referralCode: agency.referralCode,
    });
  });

  /** Host claims agency via referral code */
  app.post('/api/host/join-agency', (req, res) => {
    const hostId = String(
      req.body?.hostId || req.headers['x-user-id'] || '',
    ).trim();
    const code = String(req.body?.referralCode || '').trim();
    if (!hostId || !code) {
      res.status(400).json({ error: 'hostId and referralCode required' });
      return;
    }
    const agency = findAgencyByReferralCode(code);
    if (!agency || agency.status !== 'active') {
      res.status(404).json({ error: 'Invalid or inactive referral code' });
      return;
    }
    const existing = hostAgency.get(hostId);
    if (existing && existing !== agency.id) {
      res.status(409).json({
        error: 'Host already linked to another agency',
        agencyId: existing,
      });
      return;
    }
    const wasNew = existing !== agency.id;
    assignHost(agency.id, hostId);
    if (wasNew) {
      agency.inviteJoins += 1;
      agency.updatedAt = Date.now();
    }
    persist();
    res.json({
      ok: true,
      agencyId: agency.id,
      agencyName: agency.name,
      referralCode: agency.referralCode,
      joined: wasNew,
    });
  });

  app.get('/api/admin/revenue', (req, res) => {
    if (!ctx.requireStaff(req, res)) return;
    const agencyId = scopedAgencyId(
      req,
      String(req.query.agencyId || '').trim(),
    );
    const snapshot = ctx.getHostRevenueSnapshot();
    let rows = snapshot;
    if (agencyId) {
      rows = snapshot.filter((r) => r.agencyId === agencyId);
    } else if (getAgencyAuth(req)?.kind === 'agency') {
      res.status(403).json({ error: 'Agency scope required' });
      return;
    }
    const agencyList = agencyId
      ? listAgencies().filter((a) => a.id === agencyId)
      : listAgencies();
    const agencyRev = agencyList.map((a) => ({
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
    if (!ctx.requireStaff(req, res)) return;
    const agencyId = scopedAgencyId(
      req,
      String(req.query.agencyId || '').trim(),
    );
    const snapshot = ctx.getHostRevenueSnapshot();
    let agency = snapshot.filter((h) => h.type === 'agency');
    let individual = snapshot.filter((h) => h.type === 'individual');
    if (agencyId) {
      agency = agency.filter((h) => h.agencyId === agencyId);
      individual = [];
    }
    res.json({ agency, individual });
  });

  app.get('/api/admin/agency-ledger', (req, res) => {
    if (!ctx.requireStaff(req, res)) return;
    const agencyId = scopedAgencyId(
      req,
      String(req.query.agencyId || '').trim(),
    );
    if (!agencyId) {
      res.status(400).json({ error: 'agencyId required' });
      return;
    }
    const agency = getAgency(agencyId);
    if (!agency) {
      res.status(404).json({ error: 'Agency not found' });
      return;
    }
    const snapshot = ctx
      .getHostRevenueSnapshot()
      .filter((h) => h.agencyId === agencyId);
    const agencyShare = Math.round(
      (agency.revenueMonth * agency.commissionPercent) / 100,
    );
    res.json({
      agency: publicAgency(agency),
      hosts: snapshot,
      totals: {
        hosts: snapshot.length,
        activeHosts: snapshot.length,
        revenue: snapshot.reduce((s, h) => s + (h.revenueGenerated || 0), 0),
        pending: snapshot.reduce((s, h) => s + (h.pendingEarnings || 0), 0),
        paid: snapshot.reduce((s, h) => s + (h.paidEarnings || 0), 0),
        agencyCommissionMonth: agencyShare,
        inviteClicks: agency.inviteClicks,
        inviteJoins: agency.inviteJoins,
        conversionRate:
          agency.inviteClicks > 0
            ? Math.round((agency.inviteJoins / agency.inviteClicks) * 1000) /
              10
            : 0,
      },
    });
  });

  app.get('/api/admin/agency-referrals', (req, res) => {
    if (!ctx.requireStaff(req, res)) return;
    const agencyId = scopedAgencyId(
      req,
      String(req.query.agencyId || '').trim(),
    );
    if (!agencyId) {
      res.status(400).json({ error: 'agencyId required' });
      return;
    }
    const agency = getAgency(agencyId);
    if (!agency) {
      res.status(404).json({ error: 'Agency not found' });
      return;
    }
    res.json({
      agencyId: agency.id,
      referralCode: agency.referralCode,
      referralLink: referralLinkFor(agency.referralCode),
      inviteClicks: agency.inviteClicks,
      inviteJoins: agency.inviteJoins,
      hostIds: agency.hostIds,
      conversionRate:
        agency.inviteClicks > 0
          ? Math.round((agency.inviteJoins / agency.inviteClicks) * 1000) / 10
          : 0,
    });
  });

  /** Admin broadcasts announcements */
  app.post('/api/admin/agency-announcements', (req, res) => {
    if (!ctx.requireStaff(req, res) || !ctx.isPlatformAdmin(req)) {
      if (!res.headersSent) res.status(403).json({ error: 'Admin only' });
      return;
    }
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const body = String(req.body?.body || '').trim().slice(0, 4000);
    if (!title || !body) {
      res.status(400).json({ error: 'title and body required' });
      return;
    }
    const agencyIds = Array.isArray(req.body?.agencyIds)
      ? req.body.agencyIds.map((x: unknown) => String(x))
      : [];
    const row: AgencyAnnouncement = {
      id: `ann_${randomUUID().slice(0, 10)}`,
      title,
      body,
      agencyIds,
      createdAt: Date.now(),
      createdBy: 'admin',
    };
    announcements.unshift(row);
    if (announcements.length > 100) announcements.length = 100;
    persist();
    res.json({ ok: true, announcement: row });
  });

  app.get('/api/admin/agency-announcements', (req, res) => {
    if (!ctx.requireStaff(req, res)) return;
    const auth = getAgencyAuth(req);
    let list = [...announcements];
    if (auth?.kind === 'agency' && auth.agency) {
      const id = auth.agency.id;
      list = list.filter(
        (a) => !a.agencyIds.length || a.agencyIds.includes(id),
      );
    }
    res.json({ announcements: list.slice(0, 50) });
  });

  /** Agency → hosts mass note (stored as announcement to self for audit + DM seed) */
  app.post('/api/admin/agency-host-message', (req, res) => {
    if (!ctx.requireStaff(req, res)) return;
    const auth = getAgencyAuth(req);
    const agencyId = scopedAgencyId(
      req,
      String(req.body?.agencyId || '').trim(),
    );
    if (!agencyId) {
      res.status(400).json({ error: 'agencyId required' });
      return;
    }
    if (auth?.kind === 'agency' && auth.agency?.id !== agencyId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const agency = getAgency(agencyId);
    if (!agency) {
      res.status(404).json({ error: 'Agency not found' });
      return;
    }
    const text = String(req.body?.text || '').trim().slice(0, 1000);
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }
    const hostIds = Array.isArray(req.body?.hostIds)
      ? req.body.hostIds.map((x: unknown) => String(x)).filter(Boolean)
      : [...agency.hostIds];
    const allowed = hostIds.filter((h) => agency.hostIds.includes(h));
    ctx.notifyHosts?.(allowed, {
      title: `${agency.name}`,
      body: text,
      kind: 'agency_message',
    });
    res.json({
      ok: true,
      sent: allowed.length,
      hostIds: allowed,
      preview: text.slice(0, 80),
    });
  });
}

/** Attach demo hosts to seed agencies when host registry is known */
export function linkDemoHostsIfEmpty(hostIds: string[]) {
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

/** Unused helper kept for future hashed keys */
export function hashLoginKey(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

export function agencyMiddleware(_req: Request, _res: Response, next: NextFunction) {
  next();
}
