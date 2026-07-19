/**
 * Host app force-update config — admin sets min version; hosts poll + Firebase listen.
 */

import type { Express, Request, Response } from 'express';

export type HostAppUpdateConfig = {
  /** Semantic version currently shipping (display) */
  latestVersion: string;
  /** Hosts below this version are blocked when forceUpdate is true */
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

const DEFAULT: HostAppUpdateConfig = {
  latestVersion: '1.0.0',
  minVersion: '1.0.0',
  forceUpdate: false,
  title: 'Update required',
  message:
    'A new CoinCall Host version is available. Please update to continue earning.',
  iosStoreUrl: '',
  androidStoreUrl: '',
  webUpdateUrl: '',
  updatedAt: Date.now(),
  updatedBy: 'system',
};

let config: HostAppUpdateConfig = { ...DEFAULT };

export function getHostAppUpdateConfig() {
  return { ...config };
}

export function setHostAppUpdateConfig(
  patch: Partial<HostAppUpdateConfig>,
  updatedBy = 'admin',
): HostAppUpdateConfig {
  config = {
    ...config,
    ...patch,
    latestVersion: String(patch.latestVersion ?? config.latestVersion).trim() || config.latestVersion,
    minVersion: String(patch.minVersion ?? config.minVersion).trim() || config.minVersion,
    forceUpdate: patch.forceUpdate != null ? Boolean(patch.forceUpdate) : config.forceUpdate,
    title: String(patch.title ?? config.title).trim() || config.title,
    message: String(patch.message ?? config.message).trim() || config.message,
    iosStoreUrl: String(patch.iosStoreUrl ?? config.iosStoreUrl).trim(),
    androidStoreUrl: String(patch.androidStoreUrl ?? config.androidStoreUrl).trim(),
    webUpdateUrl: String(patch.webUpdateUrl ?? config.webUpdateUrl).trim(),
    updatedAt: Date.now(),
    updatedBy,
  };
  return getHostAppUpdateConfig();
}

/** Compare semver-ish strings: a < b → -1, a = b → 0, a > b → 1 */
export function compareSemver(a: string, b: string): number {
  const pa = String(a || '0')
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0')
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function hostNeedsForceUpdate(currentVersion: string): boolean {
  const cfg = getHostAppUpdateConfig();
  if (!cfg.forceUpdate) return false;
  return compareSemver(currentVersion, cfg.minVersion) < 0;
}

export function registerHostAppUpdateRoutes(
  app: Express,
  deps: {
    requireAdmin: (req: Request, res: Response) => boolean;
    broadcastWs?: (event: unknown) => void;
  },
) {
  /** Public — host app checks on launch / resume */
  app.get('/api/host/app-update', (req, res) => {
    const current = String(req.query.version || '').trim();
    const cfg = getHostAppUpdateConfig();
    const needsUpdate =
      current.length > 0 ? hostNeedsForceUpdate(current) : cfg.forceUpdate;
    res.json({
      ...cfg,
      needsForceUpdate: needsUpdate,
      currentVersion: current || null,
    });
  });

  app.get('/api/admin/host-app-update', (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    res.json({ config: getHostAppUpdateConfig() });
  });

  app.post('/api/admin/host-app-update', (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    const adminId = String(
      req.headers['x-admin-id'] || req.body?.adminId || 'admin',
    );
    const body = req.body || {};
    const next = setHostAppUpdateConfig(
      {
        latestVersion: body.latestVersion,
        minVersion: body.minVersion,
        forceUpdate: body.forceUpdate,
        title: body.title,
        message: body.message,
        iosStoreUrl: body.iosStoreUrl,
        androidStoreUrl: body.androidStoreUrl,
        webUpdateUrl: body.webUpdateUrl,
      },
      adminId,
    );
    deps.broadcastWs?.({
      type: 'host:force_update',
      payload: next,
    });
    res.json({
      ok: true,
      config: next,
      firebaseMirror: {
        path: 'appConfig/hostApp',
        value: next,
      },
    });
  });
}
