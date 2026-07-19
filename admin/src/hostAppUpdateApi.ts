/**
 * Host app force-update admin API + Firebase mirror.
 */

import { ref, set } from 'firebase/database';
import { adminKey, apiBaseUrl, db } from './firebase';

export type HostAppUpdateConfig = {
  latestVersion: string;
  minVersion: string;
  forceUpdate: boolean;
  title: string;
  message: string;
  iosStoreUrl: string;
  androidStoreUrl: string;
  webUpdateUrl: string;
  updatedAt: number;
  updatedBy: string;
};

function adminHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-key': localStorage.getItem('cc_admin_key') || adminKey,
    'x-admin-id': localStorage.getItem('cc_admin_id') || 'admin',
    'x-admin-role': localStorage.getItem('cc_admin_role') || 'super_admin',
    'x-agency-id': localStorage.getItem('cc_agency_id') || '',
  };
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...adminHeaders(),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error((await res.text()) || `Request failed ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchHostAppUpdateConfig() {
  return adminFetch<{ config: HostAppUpdateConfig }>('/admin/host-app-update');
}

export async function saveHostAppUpdateConfig(
  patch: Partial<HostAppUpdateConfig>,
) {
  const data = await adminFetch<{
    ok: boolean;
    config: HostAppUpdateConfig;
    firebaseMirror: { path: string; value: HostAppUpdateConfig };
  }>('/admin/host-app-update', {
    method: 'POST',
    body: JSON.stringify(patch),
  });

  // Mirror to RTDB so hosts update instantly without polling only
  try {
    if (db && data.firebaseMirror?.value) {
      await set(ref(db, 'appConfig/hostApp'), {
        ...data.firebaseMirror.value,
        at: Date.now(),
      });
    }
  } catch {
    /* Firebase optional */
  }

  return data;
}
