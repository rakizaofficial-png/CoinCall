import { useCallback, useEffect, useState } from 'react';
import {
  fetchHostAppUpdateConfig,
  saveHostAppUpdateConfig,
  type HostAppUpdateConfig,
} from '../hostAppUpdateApi';
import { DeskField } from './DeskModal';

const EMPTY: HostAppUpdateConfig = {
  latestVersion: '1.0.0',
  minVersion: '1.0.0',
  forceUpdate: false,
  title: 'Update required',
  message:
    'A new CoinCall Host version is available. Please update to continue earning.',
  iosStoreUrl: '',
  androidStoreUrl: '',
  webUpdateUrl: '',
  updatedAt: 0,
  updatedBy: '',
};

/**
 * Super-admin control: force every host below minVersion to update.
 */
export function ForceUpdatePanel() {
  const [form, setForm] = useState<HostAppUpdateConfig>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchHostAppUpdateConfig();
      setForm(data.config || EMPTY);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to load update config');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch?: Partial<HostAppUpdateConfig>) => {
    setBusy(true);
    setMsg('');
    try {
      const next = { ...form, ...patch };
      setForm(next);
      const res = await saveHostAppUpdateConfig(next);
      setForm(res.config);
      setMsg(
        res.config.forceUpdate
          ? `Force update ON · hosts below ${res.config.minVersion} are blocked`
          : 'Force update OFF · hosts can stay on current build',
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const set =
    (key: keyof HostAppUpdateConfig) =>
    (value: string | boolean) =>
      setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="desk-root" style={{ marginBottom: 28 }}>
      <div className="desk-header">
        <div>
          <h2>Host app force update</h2>
          <p className="sub">
            Push a mandatory update to the CoinCall host app. Hosts below the
            minimum version see a blocking screen until they update.
          </p>
        </div>
        <div className="desk-header-actions">
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => void load()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn-pink"
            disabled={busy}
            onClick={() => void save()}
          >
            Save &amp; push
          </button>
        </div>
      </div>

      {msg ? <div className="hm-toast desk-toast">{msg}</div> : null}

      <div className="desk-table-wrap" style={{ padding: 18, minWidth: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 14,
          }}
        >
          <DeskField label="Latest version">
            <input
              value={form.latestVersion}
              onChange={(e) => set('latestVersion')(e.target.value)}
              placeholder="1.0.1"
            />
          </DeskField>
          <DeskField label="Minimum required version">
            <input
              value={form.minVersion}
              onChange={(e) => set('minVersion')(e.target.value)}
              placeholder="1.0.1"
            />
          </DeskField>
          <DeskField label="Force update">
            <label className="desk-check-row" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={form.forceUpdate}
                onChange={(e) => {
                  const on = e.target.checked;
                  setForm((f) => ({ ...f, forceUpdate: on }));
                  void save({ forceUpdate: on });
                }}
              />
              <span>
                {form.forceUpdate
                  ? 'ON — block outdated hosts now'
                  : 'OFF — optional update only'}
              </span>
            </label>
          </DeskField>
        </div>

        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          <DeskField label="Title">
            <input
              value={form.title}
              onChange={(e) => set('title')(e.target.value)}
            />
          </DeskField>
          <DeskField label="Message shown to hosts">
            <textarea
              rows={3}
              value={form.message}
              onChange={(e) => set('message')(e.target.value)}
            />
          </DeskField>
        </div>

        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <DeskField label="iOS App Store URL">
            <input
              value={form.iosStoreUrl}
              onChange={(e) => set('iosStoreUrl')(e.target.value)}
              placeholder="https://apps.apple.com/…"
            />
          </DeskField>
          <DeskField label="Android Play Store URL">
            <input
              value={form.androidStoreUrl}
              onChange={(e) => set('androidStoreUrl')(e.target.value)}
              placeholder="https://play.google.com/…"
            />
          </DeskField>
          <DeskField label="Web / fallback URL">
            <input
              value={form.webUpdateUrl}
              onChange={(e) => set('webUpdateUrl')(e.target.value)}
              placeholder="https://…"
            />
          </DeskField>
        </div>

        <div className="meta" style={{ marginTop: 14 }}>
          Status:{' '}
          <span
            className={`badge solid ${form.forceUpdate ? 'banned' : 'approved'}`}
          >
            {form.forceUpdate ? 'Force ON' : 'Force OFF'}
          </span>
          {form.updatedAt
            ? ` · Last push ${new Date(form.updatedAt).toLocaleString()} by ${form.updatedBy || '—'}`
            : null}
        </div>

        <div className="desk-row-actions" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn-red"
            disabled={busy}
            onClick={() =>
              void save({
                forceUpdate: true,
                minVersion: form.minVersion || form.latestVersion || '1.0.0',
              })
            }
          >
            Enable force update now
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy || !form.forceUpdate}
            onClick={() => void save({ forceUpdate: false })}
          >
            Disable force update
          </button>
        </div>
      </div>
    </div>
  );
}
