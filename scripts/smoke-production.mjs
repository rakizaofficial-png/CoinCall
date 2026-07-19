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

  await check('POST /host/mass-text', async () => {
    await json('/host/mass-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostId: 'smoke_host',
        hostName: 'Smoke Host',
        text: 'Smoke mass text',
      }),
    });
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
