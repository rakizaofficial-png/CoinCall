import { useEffect, useRef, useState } from 'react';
import AgoraRTC, { type IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import { fetchMonitorToken } from '../api';
import { agoraAppId } from '../firebase';

export type MonitorTarget = {
  id: string;
  kind: 'call' | 'live';
  title: string;
  subtitle: string;
  channel: string;
};

/**
 * Floating mobile-sized silent surveillance dock (right side).
 * Joins Agora as subscriber only — host/user are not notified.
 */
export function LiveMonitorDock({
  target,
  onClose,
}: {
  target: MonitorTarget | null;
  onClose: () => void;
}) {
  const primaryRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!target) return;
    let dead = false;

    (async () => {
      try {
        setStatus('Joining silently…');
        await leave();
        const uid = 900000 + Math.floor(Math.random() * 9999);
        const token = await fetchMonitorToken(target.channel, uid);
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;
        let slot = 0;
        client.on('user-published', async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === 'video' && user.videoTrack) {
            const el =
              slot === 0 ? primaryRef.current : secondaryRef.current;
            slot += 1;
            if (el) user.videoTrack.play(el, { fit: 'cover' });
          }
          if (mediaType === 'audio' && user.audioTrack) {
            user.audioTrack.play();
          }
        });
        await client.join(
          token.appId || agoraAppId,
          token.channel || target.channel,
          token.token,
          uid,
        );
        if (!dead) {
          setStatus(
            target.kind === 'live'
              ? 'Silent live watch · host cannot see you'
              : 'Silent call monitor · neither side can see you',
          );
        }
      } catch (e) {
        if (!dead) {
          setStatus(e instanceof Error ? e.message : 'Monitor failed');
        }
      }
    })();

    return () => {
      dead = true;
      void leave();
    };
  }, [target?.id, target?.channel]);

  async function leave() {
    const client = clientRef.current;
    clientRef.current = null;
    if (!client) return;
    try {
      await client.leave();
    } catch {
      /* ignore */
    }
  }

  if (!target) return null;

  return (
    <aside className="monitor-dock" aria-label="Silent surveillance">
      <div className="monitor-dock-phone">
        <div className="monitor-dock-notch" />
        <header className="monitor-dock-head">
          <div>
            <strong>{target.title}</strong>
            <p>{target.subtitle}</p>
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void leave();
              onClose();
            }}
          >
            Close
          </button>
        </header>
        <div className="monitor-dock-status">{status}</div>
        <div
          ref={primaryRef}
          className="monitor-dock-stage"
          id="admin-monitor-primary"
        />
        {target.kind === 'call' ? (
          <div
            ref={secondaryRef}
            className="monitor-dock-pip"
            id="admin-monitor-secondary"
          />
        ) : null}
        <footer className="monitor-dock-foot">
          <span className="badge live">SECRET</span>
          Subscribe-only · no publish
        </footer>
      </div>
    </aside>
  );
}
