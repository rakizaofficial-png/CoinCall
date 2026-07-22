#!/usr/bin/env node
/**
 * Production smoke tests against live CoinCall API (+ optional Luma/Host URLs).
 * Usage: node scripts/smoke-production.mjs
 * Env: API_BASE (default https://coincall-api.onrender.com/api)
 */
const API = (process.env.API_BASE || 'https://coincall-api.onrender.com/api').replace(
  /\/$/,
  '',
);
const LUMA = process.env.LUMA_URL || 'https://luma-user.onrender.com';
const HOST = process.env.HOST_URL || 'https://coincall-host.onrender.com';

let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`✗ ${name}:`, e instanceof Error ? e.message : e);
  }
}

async function json(path, init) {
  const res = await fetch(`${API}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function main() {
  console.log(`Smoke → ${API}`);

  await check('GET /health', async () => {
    const h = await json('/health');
    if (!h.ok) throw new Error('not ok');
    if (!h.agoraConfigured) throw new Error('Agora not configured on API');
  });

  await check('GET /hosts', async () => {
    const d = await json('/hosts');
    if (!Array.isArray(d.hosts) && !Array.isArray(d)) throw new Error('bad hosts payload');
  });

  await check('GET /live/rooms', async () => {
    await json('/live/rooms');
  });

  await check('GET /live/token', async () => {
    const t = await json('/live/token?hostId=smoke_host&channel=live_smoke_host');
    if (!t.token || !t.appId) throw new Error('missing token/appId');
  });

  await check('POST /wallet/me', async () => {
    const w = await json('/wallet/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: `smoke_${Date.now()}`,
        role: 'user',
        displayName: 'Smoke User',
      }),
    });
    if (typeof w.wallet?.coinBalance !== 'number' && typeof w.coinBalance !== 'number') {
      // tolerate either shape
      if (!w.ok && !w.wallet) throw new Error('no wallet');
    }
  });

  await check('POST /wallet/credit requires X-User-Id', async () => {
    const res = await fetch(`${API}/wallet/credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'smoke_noauth', amount: 1, reason: 'reward:smoke' }),
    });
    if (res.status !== 401) throw new Error(`expected 401 got ${res.status}`);
  });

  await check('POST /calls/route AI fallback', async () => {
    const d = await json('/calls/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId: 'offline_host_smoke_xyz' }),
    });
    if (!d.decision?.transport) throw new Error('no decision');
    if (
      d.decision.transport !== 'ai_prerecorded' &&
      d.decision.transport !== 'agora_live'
    ) {
      throw new Error(`unexpected transport ${d.decision.transport}`);
    }
  });

  await check('GET /ai-hosts', async () => {
    const d = await json('/ai-hosts');
    if (!Array.isArray(d.hosts) || d.hosts.length < 1) throw new Error('no ai hosts');
  });

  await check('POST /host/mass-text', async () => {
    const res = await fetch(`${API}/host/mass-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostId: 'smoke_host',
        hostName: 'Smoke Host',
        text: 'Smoke mass text',
      }),
    });
    // 409 = no active fans online (valid empty-state), 200 = delivered
    if (res.status !== 200 && res.status !== 409) {
      const body = await res.text();
      throw new Error(`${res.status} ${body.slice(0, 200)}`);
    }
  });

  await check('Luma HTTP 200', async () => {
    const res = await fetch(LUMA, { redirect: 'follow' });
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  await check('Host HTTP 200', async () => {
    const res = await fetch(HOST, { redirect: 'follow' });
    if (!res.ok) throw new Error(`status ${res.status}`);
  });

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll smoke checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
