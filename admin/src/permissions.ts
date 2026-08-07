/** Role → section permissions for CoinCall web admin */

export type AdminRole =
  | 'super_admin'
  | 'moderator'
  | 'finance'
  | 'support'
  | 'agency';

export type AdminSection =
  | 'dashboard'
  | 'agencies'
  | 'hosts'
  | 'users'
  | 'revenue'
  | 'pricing'
  | 'payments'
  | 'referrals'
  | 'inbox'
  | 'calls'
  | 'control'
  | 'payouts'
  | 'reports'
  | 'videos'
  | 'banners';

export type AgencyPerms = {
  canViewRevenue: boolean;
  canManageHosts: boolean;
  canRequestPayout: boolean;
  canViewCalls: boolean;
  canMonitor: boolean;
};

const FULL: AdminSection[] = [
  'dashboard',
  'agencies',
  'hosts',
  'users',
  'revenue',
  'pricing',
  'payments',
  'referrals',
  'inbox',
  'calls',
  'control',
  'payouts',
  'reports',
  'videos',
  'banners',
];

const ROLE_SECTIONS: Record<AdminRole, AdminSection[]> = {
  super_admin: FULL,
  moderator: [
    'dashboard',
    'hosts',
    'calls',
    'control',
    'reports',
    'videos',
    'banners',
    'inbox',
  ],
  finance: ['dashboard', 'revenue', 'pricing', 'payments', 'payouts', 'users', 'agencies', 'referrals'],
  support: [
    'dashboard',
    'users',
    'reports',
    'hosts',
    'inbox',
  ],
  agency: [
    'dashboard',
    'hosts',
    'revenue',
    'referrals',
    'inbox',
    'calls',
    'payouts',
  ],
};

export function sectionsForRole(
  role: AdminRole,
  agencyPerms?: AgencyPerms | null,
): AdminSection[] {
  let list = [...(ROLE_SECTIONS[role] || ROLE_SECTIONS.support)];
  if (role === 'agency' && agencyPerms) {
    if (!agencyPerms.canViewRevenue) list = list.filter((s) => s !== 'revenue');
    if (!agencyPerms.canManageHosts)
      list = list.filter((s) => s !== 'hosts');
    if (!agencyPerms.canViewCalls && !agencyPerms.canMonitor)
      list = list.filter((s) => s !== 'calls');
    if (!agencyPerms.canRequestPayout)
      list = list.filter((s) => s !== 'payouts');
  }
  return list;
}

export function canAccess(
  role: AdminRole,
  section: AdminSection,
  agencyPerms?: AgencyPerms | null,
) {
  return sectionsForRole(role, agencyPerms).includes(section);
}
