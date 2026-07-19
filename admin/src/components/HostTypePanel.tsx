import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  assignHostToAgency,
  fetchAgencies,
  fetchHostTypes,
  type Agency,
  type RevenueHostRow,
} from '../agencyApi';
import { FadeIn } from './AnimatedPage';

export function HostTypePanel({
  mode,
  agencyId,
  canManage,
}: {
  mode: 'agency' | 'individual';
  agencyId?: string | null;
  canManage?: boolean;
}) {
  const [rows, setRows] = useState<RevenueHostRow[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchHostTypes();
      let list = mode === 'agency' ? data.agency : data.individual;
      if (agencyId) {
        list = data.agency.filter((h) => h.agencyId === agencyId);
      }
      setRows(list || []);
      if (mode === 'individual' || canManage) {
        const ag = await fetchAgencies();
        setAgencies(ag.agencies || []);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Load failed');
    }
  }, [mode, agencyId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(hostId: string) {
    if (!canManage || !agencies.length) return;
    const names = agencies.map((a, i) => `${i + 1}. ${a.name}`).join('\n');
    const pick = window.prompt(`Assign to agency:\n${names}\nEnter number`);
    const idx = Number(pick) - 1;
    const agency = agencies[idx];
    if (!agency) return;
    await assignHostToAgency(agency.id, hostId, 'assign');
    setMsg(`Assigned to ${agency.name}`);
    await load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>
            {mode === 'agency' ? 'Agency hosts' : 'Individual hosts'}
          </h2>
          <p className="sub">
            {mode === 'agency'
              ? agencyId
                ? 'Hosts under your agency only'
                : 'Hosts managed by partner agencies'
              : 'Independent hosts · not under an agency'}
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {msg ? <div className="hm-toast">{msg}</div> : null}

      <div className="list">
        {rows.length === 0 ? (
          <div className="empty-state">No {mode} hosts found.</div>
        ) : (
          rows.map((h, i) => (
            <FadeIn key={h.hostId} delay={i * 0.03}>
              <motion.div
                className="card"
                style={{ gridTemplateColumns: '1fr auto' }}
                whileHover={{ scale: 1.005 }}
              >
                <div>
                  <h3>{h.name}</h3>
                  <div className="meta">
                    <code>{h.hostId}</code>
                    <br />
                    {h.agencyName ? (
                      <>Agency {h.agencyName}</>
                    ) : (
                      <>Independent</>
                    )}{' '}
                    · Revenue {h.revenueGenerated.toLocaleString()}
                  </div>
                </div>
                {mode === 'individual' && canManage ? (
                  <div className="actions">
                    <button
                      type="button"
                      className="btn-pink"
                      onClick={() => void assign(h.hostId)}
                    >
                      Assign agency
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      fontFamily: 'var(--display)',
                      fontWeight: 800,
                      fontSize: 18,
                    }}
                  >
                    {h.revenueGenerated.toLocaleString()}
                  </div>
                )}
              </motion.div>
            </FadeIn>
          ))
        )}
      </div>
    </>
  );
}
