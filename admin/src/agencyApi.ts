import { adminKey, apiBaseUrl } from './firebase';
import type { AgencyPerms } from './permissions';

export type AgencyStatus = 'pending' | 'active' | 'suspended';

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
  hostCount?: number;
  permissions: AgencyPerms;
  referralCode?: string;
  referralLink?: string;
  minWithdrawCoins?: number;
  maxWithdrawCoins?: number;
  dailyWithdrawCap?: number;
  inviteClicks?: number;
  inviteJoins?: number;
  revenueTotal: number;
  revenueMonth: number;
  createdAt: number;
  updatedAt: number;
};

export type RevenueHostRow = {
  hostId: string;
  name: string;
  revenueGenerated: number;
  pendingEarnings: number;
  paidEarnings: number;
  type: 'agency' | 'individual';
  agencyId?: string;
  agencyName?: string;
};

export type AgencyAnnouncement = {
  id: string;
  title: string;
  body: string;
  agencyIds: string[];
  createdAt: number;
  createdBy: string;
};

function adminKeyHeader() {
  return localStorage.getItem('cc_admin_key') || adminKey;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(
    `${apiBaseUrl}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(adminKeyHeader())}`,
    { headers: { 'x-admin-key': adminKeyHeader() }, cache: 'no-store' },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKeyHeader(),
    },
    body: JSON.stringify({ ...body, key: adminKeyHeader() }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: 'DELETE',
    headers: { 'x-admin-key': adminKeyHeader() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function fetchAgencies() {
  return get<{ agencies: Agency[]; count: number }>('/admin/agencies');
}

export async function createAgency(input: {
  name: string;
  ownerName: string;
  email: string;
  commissionPercent?: number;
  country?: string;
  phone?: string;
  address?: string;
  nationalId?: string;
  passportNumber?: string;
  passportDocument?: string;
  passportDocumentName?: string;
  minWithdrawCoins?: number;
  maxWithdrawCoins?: number;
  dailyWithdrawCap?: number;
  password: string;
}) {
  return post<{
    ok: boolean;
    agency: Agency;
    email: string;
    referralCode: string;
    referralLink: string;
  }>('/admin/agencies', input);
}

export async function updateAgency(
  id: string,
  patch: Partial<Agency> & { loginKey?: string },
) {
  return post<{ ok: boolean; agency: Agency }>(
    `/admin/agencies/${encodeURIComponent(id)}`,
    patch as Record<string, unknown>,
  );
}

export async function deleteAgency(id: string) {
  return del<{ ok: boolean; deleted: string }>(
    `/admin/agencies/${encodeURIComponent(id)}`,
  );
}

export async function assignHostToAgency(
  agencyId: string,
  hostId: string,
  action: 'assign' | 'remove' = 'assign',
) {
  return post<{ ok: boolean; agency: Agency }>(
    `/admin/agencies/${encodeURIComponent(agencyId)}/hosts`,
    { hostId, action },
  );
}

export async function fetchRevenue(agencyId?: string) {
  const q = agencyId ? `?agencyId=${encodeURIComponent(agencyId)}` : '';
  return get<{
    totals: {
      allHosts: number;
      agencyHosts: number;
      individualHosts: number;
      agenciesMonth: number;
    };
    agencies: {
      id: string;
      name: string;
      status: string;
      commissionPercent: number;
      hostCount: number;
      revenueTotal: number;
      revenueMonth: number;
      agencyShare: number;
      platformShare: number;
    }[];
    hosts: RevenueHostRow[];
  }>(`/admin/revenue${q}`);
}

export async function fetchHostTypes(agencyId?: string) {
  const q = agencyId ? `?agencyId=${encodeURIComponent(agencyId)}` : '';
  return get<{ agency: RevenueHostRow[]; individual: RevenueHostRow[] }>(
    `/admin/host-types${q}`,
  );
}

export async function fetchAgencyLedger(agencyId: string) {
  return get<{
    agency: Agency;
    hosts: RevenueHostRow[];
    totals: {
      hosts: number;
      activeHosts: number;
      revenue: number;
      pending: number;
      paid: number;
      agencyCommissionMonth: number;
      inviteClicks: number;
      inviteJoins: number;
      conversionRate: number;
    };
  }>(`/admin/agency-ledger?agencyId=${encodeURIComponent(agencyId)}`);
}

export async function fetchAgencyReferrals(agencyId: string) {
  return get<{
    agencyId: string;
    referralCode: string;
    referralLink: string;
    inviteClicks: number;
    inviteJoins: number;
    hostIds: string[];
    conversionRate: number;
  }>(`/admin/agency-referrals?agencyId=${encodeURIComponent(agencyId)}`);
}

export async function fetchAgencyAnnouncements() {
  return get<{ announcements: AgencyAnnouncement[] }>(
    '/admin/agency-announcements',
  );
}

export async function broadcastAgencyAnnouncement(input: {
  title: string;
  body: string;
  agencyIds?: string[];
}) {
  return post<{ ok: boolean; announcement: AgencyAnnouncement }>(
    '/admin/agency-announcements',
    input,
  );
}

export async function sendAgencyHostMessage(input: {
  agencyId: string;
  text: string;
  hostIds?: string[];
}) {
  return post<{ ok: boolean; sent: number; preview: string }>(
    '/admin/agency-host-message',
    input,
  );
}
