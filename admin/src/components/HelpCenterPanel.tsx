import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAdminSupportTickets,
  fetchHelpCenterArticles,
  updateSupportTicketStatus,
  type HelpArticle,
  type SupportTicketRow,
} from '../api';

type Filter = 'all' | 'open' | 'answered' | 'closed';

export function HelpCenterPanel() {
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [counts, setCounts] = useState({ open: 0, answered: 0, closed: 0, total: 0 });
  const [filter, setFilter] = useState<Filter>('open');
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [view, setView] = useState<'tickets' | 'guides'>('tickets');

  const load = useCallback(async () => {
    try {
      const [ticketData, articleData] = await Promise.all([
        fetchAdminSupportTickets(filter === 'all' ? undefined : filter),
        fetchHelpCenterArticles(),
      ]);
      setTickets(ticketData.tickets || []);
      setCounts(ticketData.counts || { open: 0, answered: 0, closed: 0, total: 0 });
      setArticles(articleData.articles || []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to load help center');
    }
  }, [filter]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 12_000);
    return () => clearInterval(t);
  }, [load]);

  const sorted = useMemo(
    () => [...tickets].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [tickets],
  );

  async function act(
    id: string,
    status: 'open' | 'answered' | 'closed',
    withReply = false,
  ) {
    setBusyId(id);
    setMsg('');
    try {
      const reply = withReply ? (replyDraft[id] || '').trim() : undefined;
      if (withReply && !reply) {
        setMsg('Write a reply before marking answered');
        setBusyId(null);
        return;
      }
      await updateSupportTicketStatus(id, status, reply);
      if (withReply) {
        setReplyDraft((d) => {
          const next = { ...d };
          delete next[id];
          return next;
        });
      }
      setMsg(status === 'answered' ? 'Reply sent to host' : `Ticket → ${status}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="desk-root help-center">
      <div className="desk-header help-head">
        <div>
          <h2>Help Center</h2>
          <p className="sub">
            Host support tickets · Android guides · reply from phone or desktop
          </p>
        </div>
        <div className="help-view-toggle">
          <button
            type="button"
            className={view === 'tickets' ? 'on' : ''}
            onClick={() => setView('tickets')}
          >
            Tickets
            {counts.open ? <span className="help-badge">{counts.open}</span> : null}
          </button>
          <button
            type="button"
            className={view === 'guides' ? 'on' : ''}
            onClick={() => setView('guides')}
          >
            Host guides
          </button>
        </div>
      </div>

      {msg ? <div className="hm-toast desk-toast">{msg}</div> : null}

      {view === 'tickets' ? (
        <>
          <div className="help-stats">
            <div className="help-stat">
              <strong>{counts.open}</strong>
              <span>Open</span>
            </div>
            <div className="help-stat">
              <strong>{counts.answered}</strong>
              <span>Answered</span>
            </div>
            <div className="help-stat">
              <strong>{counts.closed}</strong>
              <span>Closed</span>
            </div>
            <div className="help-stat">
              <strong>{counts.total}</strong>
              <span>Total</span>
            </div>
          </div>

          <div className="help-filters">
            {(['open', 'answered', 'closed', 'all'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`help-filter ${filter === f ? 'on' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="help-ticket-list">
            {sorted.length === 0 ? (
              <div className="agency-card">
                <p className="sub" style={{ margin: 0 }}>
                  No {filter === 'all' ? '' : filter} tickets right now.
                </p>
              </div>
            ) : (
              sorted.map((t) => (
                <article key={t.id} className={`help-ticket status-${t.status}`}>
                  <header className="help-ticket-top">
                    <div>
                      <div className="help-ticket-meta">
                        <span className="help-id">{t.id}</span>
                        <span className={`help-status ${t.status}`}>{t.status}</span>
                        {t.category ? (
                          <span className="help-cat">{t.category}</span>
                        ) : null}
                      </div>
                      <h3>{t.hostName || 'Host'}</h3>
                      <p className="help-host-id">{t.hostId}</p>
                    </div>
                    <time>
                      {new Date(t.updatedAt || t.createdAt).toLocaleString()}
                    </time>
                  </header>
                  <p className="help-body">{t.text}</p>
                  {t.adminReply ? (
                    <div className="help-reply-box">
                      <strong>Admin reply</strong>
                      <p>{t.adminReply}</p>
                    </div>
                  ) : null}
                  {t.status !== 'closed' ? (
                    <div className="help-actions">
                      <textarea
                        rows={3}
                        placeholder="Type reply for the host (Android notification)…"
                        value={replyDraft[t.id] || ''}
                        onChange={(e) =>
                          setReplyDraft((d) => ({ ...d, [t.id]: e.target.value }))
                        }
                      />
                      <div className="help-action-row">
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={busyId === t.id}
                          onClick={() => void act(t.id, 'answered', true)}
                        >
                          {busyId === t.id ? 'Saving…' : 'Reply & answer'}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={busyId === t.id}
                          onClick={() => void act(t.id, 'closed')}
                        >
                          Close
                        </button>
                        {t.status === 'answered' ? (
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={busyId === t.id}
                            onClick={() => void act(t.id, 'open')}
                          >
                            Reopen
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="help-action-row">
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={busyId === t.id}
                        onClick={() => void act(t.id, 'open')}
                      >
                        Reopen ticket
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="help-guides">
          <p className="sub" style={{ marginBottom: 16 }}>
            These guides appear in the CoinCall Host app Help Center (Android &
            web). Focused on going live, lock live, adult gifts, and online messaging.
          </p>
          <div className="help-guide-grid">
            {articles.map((a) => (
              <article key={a.id} className="help-guide-card">
                <span className="help-cat">{a.category}</span>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
