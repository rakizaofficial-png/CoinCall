import { useCallback, useEffect, useState } from 'react';
import { fetchAgencyReferrals } from '../agencyApi';

export function AgencyReferralsPanel({ agencyId }: { agencyId: string }) {
  const [data, setData] = useState<{
    referralCode: string;
    referralLink: string;
    inviteClicks: number;
    inviteJoins: number;
    hostIds: string[];
    conversionRate: number;
  } | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!agencyId) return;
    try {
      const res = await fetchAgencyReferrals(agencyId);
      setData(res);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to load referrals');
    }
  }, [agencyId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 12_000);
    return () => clearInterval(t);
  }, [load]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`Copied ${label}`);
    } catch {
      setMsg('Copy failed — select manually');
    }
  }

  if (!agencyId) {
    return <div className="empty-state">Sign in as an agency to view referrals.</div>;
  }

  return (
    <div className="desk-root">
      <div className="desk-header">
        <div>
          <h2>Referral system</h2>
          <p className="sub">
            Share your invite link · hosts join via code · attribution is automatic
          </p>
        </div>
      </div>

      {msg ? <div className="hm-toast desk-toast">{msg}</div> : null}

      {!data ? (
        <div className="empty-state">Loading referral stats…</div>
      ) : (
        <>
          <div className="stats">
            <div className="stat teal">
              <span>Invite clicks</span>
              <b>{data.inviteClicks}</b>
            </div>
            <div className="stat blue">
              <span>Hosts joined</span>
              <b>{data.inviteJoins}</b>
            </div>
            <div className="stat green">
              <span>Conversion</span>
              <b>{data.conversionRate}%</b>
            </div>
            <div className="stat gold">
              <span>Attributed hosts</span>
              <b>{data.hostIds.length}</b>
            </div>
          </div>

          <div className="agency-grid" style={{ marginTop: 16 }}>
            <article className="agency-card">
              <div className="agency-card-top">
                <h3>Invite code</h3>
                <p>Hosts enter this in the Host App</p>
              </div>
              <div className="referral-code">{data.referralCode}</div>
              <button
                type="button"
                className="btn-pink"
                onClick={() => void copy(data.referralCode, 'code')}
              >
                Copy code
              </button>
            </article>
            <article className="agency-card">
              <div className="agency-card-top">
                <h3>Referral link</h3>
                <p>Deep link / web join URL</p>
              </div>
              <code className="referral-link">{data.referralLink}</code>
              <button
                type="button"
                className="btn-pink"
                onClick={() => void copy(data.referralLink, 'link')}
              >
                Copy link
              </button>
            </article>
          </div>
        </>
      )}
    </div>
  );
}
