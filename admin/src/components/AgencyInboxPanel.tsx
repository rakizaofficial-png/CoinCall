import { useCallback, useEffect, useState } from 'react';
import {
  broadcastAgencyAnnouncement,
  fetchAgencyAnnouncements,
  sendAgencyHostMessage,
  type AgencyAnnouncement,
} from '../agencyApi';

export function AgencyInboxPanel({
  agencyId,
  isAdmin,
}: {
  agencyId?: string | null;
  isAdmin?: boolean;
}) {
  const [rows, setRows] = useState<AgencyAnnouncement[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [hostText, setHostText] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchAgencyAnnouncements();
      setRows(data.announcements || []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to load inbox');
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function sendToHosts() {
    if (!agencyId || !hostText.trim()) return;
    setBusy(true);
    try {
      const res = await sendAgencyHostMessage({
        agencyId,
        text: hostText.trim(),
      });
      setMsg(`Sent to ${res.sent} hosts`);
      setHostText('');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  }

  async function broadcast() {
    if (!isAdmin || !annTitle.trim() || !annBody.trim()) return;
    setBusy(true);
    try {
      await broadcastAgencyAnnouncement({
        title: annTitle.trim(),
        body: annBody.trim(),
      });
      setMsg('Announcement broadcast');
      setAnnTitle('');
      setAnnBody('');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Broadcast failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="desk-root">
      <div className="desk-header">
        <div>
          <h2>{isAdmin ? 'Agency announcements' : 'Inbox & messages'}</h2>
          <p className="sub">
            {isAdmin
              ? 'Broadcast to all agencies · agencies see scoped inbox'
              : 'Admin announcements · message your hosts'}
          </p>
        </div>
      </div>

      {msg ? <div className="hm-toast desk-toast">{msg}</div> : null}

      {isAdmin ? (
        <div className="agency-card" style={{ marginBottom: 16 }}>
          <div className="agency-card-top">
            <h3>Broadcast announcement</h3>
            <p>Visible to all agencies (or leave scoped later)</p>
          </div>
          <label className="desk-field">
            <span>Title</span>
            <input
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="Weekly targets"
            />
          </label>
          <label className="desk-field">
            <span>Message</span>
            <textarea
              rows={3}
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              placeholder="Announce payout windows, policy updates…"
            />
          </label>
          <button
            type="button"
            className="btn-pink"
            disabled={busy}
            onClick={() => void broadcast()}
          >
            Broadcast
          </button>
        </div>
      ) : null}

      {agencyId ? (
        <div className="agency-card" style={{ marginBottom: 16 }}>
          <div className="agency-card-top">
            <h3>Message hosts</h3>
            <p>Pushes into each host’s in-app notification inbox</p>
          </div>
          <label className="desk-field">
            <span>Message</span>
            <textarea
              rows={3}
              value={hostText}
              onChange={(e) => setHostText(e.target.value)}
              placeholder="Reminder: go live tonight for bonus hours…"
            />
          </label>
          <button
            type="button"
            className="btn-pink"
            disabled={busy || !hostText.trim()}
            onClick={() => void sendToHosts()}
          >
            Send to all my hosts
          </button>
        </div>
      ) : null}

      <div className="desk-table-wrap">
        {!rows.length ? (
          <div className="empty-state">No announcements yet.</div>
        ) : (
          <table className="desk-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Title</th>
                <th>Body</th>
                <th>Scope</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="meta">
                    {new Date(a.createdAt).toLocaleString()}
                  </td>
                  <td>
                    <strong>{a.title}</strong>
                  </td>
                  <td>{a.body}</td>
                  <td className="meta">
                    {a.agencyIds.length ? a.agencyIds.join(', ') : 'All agencies'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
