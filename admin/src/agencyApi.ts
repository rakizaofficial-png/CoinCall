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
  status: AgencyStatus;
  commissionPercent: number;
  hostIds: string[];
  permissions: AgencyPerms;
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

export async function fetchAgencies() {
  return get<{ agencies: Agency[]; count: number }>('/admin/agencies');
}

export async function createAgency(input: {
  name: string;
  ownerName: string;
  email: string;
  commissionPercent?: number;
  country?: string;
}) {
  return post<{ ok: boolean; agency: Agency; loginKey: string }>(
    '/admin/agencies',
    input,
  );
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

export async function fetchHostTypes() {
  return get<{ agency: RevenueHostRow[]; individual: RevenueHostRow[] }>(
    '/admin/host-types',
  );
}
