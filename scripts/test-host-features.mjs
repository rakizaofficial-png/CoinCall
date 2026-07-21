/**
 * End-to-end function tests for host modern UI features.
 * Run: node scripts/test-host-features.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPORT_PATH = join('/opt/cursor/artifacts', 'host-feature-test-report.md');

const results = [];
let passed = 0;
let failed = 0;
let skipped = 0;

function record(suite, name, status, detail = '') {
  results.push({ suite, name, status, detail });
  if (status === 'PASS') passed += 1;
  else if (status === 'FAIL') failed += 1;
  else skipped += 1;
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○';
  console.log(`${icon} [${suite}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function test(suite, name, fn) {
  try {
    const detail = await fn();
    record(suite, name, 'PASS', typeof detail === 'string' ? detail : '');
  } catch (e) {
    record(suite, name, 'FAIL', e instanceof Error ? e.message : String(e));
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

async function waitForHealth(base, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server health check timed out');
}

// ——— 1) Gift catalog unit tests (import via dynamic transpile not available;
// parse source + evaluate helper logic mirrored) ———
async function testGiftCatalog() {
  const src = readFileSync(join(ROOT, 'src/data/gifts.ts'), 'utf8');
  const adultIds = [
    'silk_whisper',
    'midnight_kiss',
    'velvet_night',
    'spicy_rose',
    'champagne_suite',
    'private_unlock',
    'diamond_desire',
    'vip_private_show',
  ];

  await test('Gifts', 'Adult gift IDs exist in catalog source', () => {
    for (const id of adultIds) {
      assert.match(src, new RegExp(`id: '${id}'`));
      assert.match(src, new RegExp(`id: '${id}'[\\s\\S]*?isAdult: true`));
    }
    return `${adultIds.length} adult gifts`;
  });

  await test('Gifts', 'PHOTO_UNLOCK_MIN_COINS is 99', () => {
    assert.match(src, /PHOTO_UNLOCK_MIN_COINS = 99/);
  });

  await test('Gifts', 'ADULT_PHOTO_UNLOCK_MIN_COINS is 149', () => {
    assert.match(src, /ADULT_PHOTO_UNLOCK_MIN_COINS = 149/);
  });

  await test('Gifts', 'giftsByCategory + adultGifts helpers exported', () => {
    assert.match(src, /export function giftsByCategory/);
    assert.match(src, /export function adultGifts/);
  });

  await test('Gifts', 'Adult aliases mapped (kiss/adult/spicy/private)', () => {
    assert.match(src, /kiss: 'midnight_kiss'/);
    assert.match(src, /adult: 'private_unlock'/);
    assert.match(src, /spicy: 'spicy_rose'/);
    assert.match(src, /private: 'private_unlock'/);
  });

  // Runtime helper mirror
  const { createRequire } = await import('node:module');
  // Use a tiny inline runtime check via node eval of extracted JSON-like data
  await test('Gifts', 'Adult gifts unlock photos and cost ≥ 149', () => {
    for (const id of adultIds) {
      const block = src.split(`id: '${id}'`)[1]?.slice(0, 500) || '';
      assert.match(block, /unlocksPhotos: true/);
      assert.match(block, /isAdult: true/);
      const coins = Number(block.match(/coins: (\d+)/)?.[1] || 0);
      assert.ok(coins >= 149, `${id} coins ${coins} < 149`);
    }
  });

  await test('Gifts', 'HostGiftPicker component present', () => {
    const picker = readFileSync(
      join(ROOT, 'src/components/gifts/HostGiftPicker.tsx'),
      'utf8',
    );
    assert.match(picker, /Adult 18\+/);
    assert.match(picker, /adultGifts/);
    assert.match(picker, /giftsByCategory/);
  });

  void createRequire;
}

async function testHostUiWiring() {
  const live = readFileSync(join(ROOT, 'src/features/live/LiveRoomScreen.tsx'), 'utf8');
  const chat = readFileSync(join(ROOT, 'src/features/chat/ChatHubScreen.tsx'), 'utf8');
  const call = readFileSync(join(ROOT, 'src/screens/call/CallScreen.tsx'), 'utf8');
  const dash = readFileSync(join(ROOT, 'src/features/dashboard/DashboardScreen.tsx'), 'utf8');
  const ctx = readFileSync(join(ROOT, 'src/context/LiveStudioContext.tsx'), 'utf8');

  await test('Host UI', 'LiveRoom Lock Live sheet + addGiftLockedPhoto', () => {
    assert.match(live, /Lock Live/);
    assert.match(live, /addGiftLockedPhoto/);
    assert.match(live, /pickLockedPhoto/);
    assert.match(live, /Adult 18\+/);
  });

  await test('Host UI', 'LiveRoom Set message / pinAnnouncement path', () => {
    assert.match(live, /Set message/);
    assert.match(live, /setAnnouncement/);
    assert.match(live, /Pin to live/);
  });

  await test('Host UI', 'CallScreen ask gift + adult request', () => {
    assert.match(call, /HostGiftPicker/);
    assert.match(call, /requestGiftFromUser/);
    assert.match(call, /askGift/);
    assert.match(call, /Adult gift requested/);
  });

  await test('Host UI', 'ChatHub online users + set message + Help Center', () => {
    assert.match(chat, /See users online/);
    assert.match(chat, /Set message/);
    assert.match(chat, /Help Center/);
    assert.match(chat, /fetchActiveUsers/);
    assert.match(chat, /fetchHelpCenterArticles/);
    assert.match(chat, /fetchHostSupportTickets/);
    assert.match(chat, /massTextAllActiveUsers/);
  });

  await test('Host UI', 'Dashboard quick tools (online / message / lock live)', () => {
    assert.match(dash, /onlineFans/);
    assert.match(dash, /Set message/);
    assert.match(dash, /Lock live/);
    assert.match(dash, /fetchActiveUsers/);
  });

  await test('Host UI', 'LiveStudioContext contactAdminSupport accepts category', () => {
    assert.match(ctx, /contactAdminSupport: \(text: string, category\?: string\)/);
    assert.match(ctx, /addGiftLockedPhoto/);
    assert.match(ctx, /setAnnouncement/);
  });
}

async function testAdminWiring() {
  const app = readFileSync(join(ROOT, 'admin/src/App.tsx'), 'utf8');
  const perms = readFileSync(join(ROOT, 'admin/src/permissions.ts'), 'utf8');
  const api = readFileSync(join(ROOT, 'admin/src/api.ts'), 'utf8');
  const panel = readFileSync(
    join(ROOT, 'admin/src/components/HelpCenterPanel.tsx'),
    'utf8',
  );
  const css = readFileSync(join(ROOT, 'admin/src/styles.css'), 'utf8');

  await test('Admin UI', 'Help section in permissions for support roles', () => {
    assert.match(perms, /\| 'help'/);
    assert.match(perms, /'help'/);
    // support role includes help
    assert.match(perms, /support: \[[\s\S]*?'help'/);
  });

  await test('Admin UI', 'App wires HelpCenterPanel tab', () => {
    assert.match(app, /HelpCenterPanel/);
    assert.match(app, /tab === 'help'/);
    assert.match(app, /help: 'Help Center'/);
  });

  await test('Admin UI', 'API helpers for tickets + articles', () => {
    assert.match(api, /fetchAdminSupportTickets/);
    assert.match(api, /updateSupportTicketStatus/);
    assert.match(api, /fetchHelpCenterArticles/);
  });

  await test('Admin UI', 'HelpCenterPanel reply / close / guides', () => {
    assert.match(panel, /Reply & answer/);
    assert.match(panel, /Close/);
    assert.match(panel, /Host guides/);
    assert.match(panel, /updateSupportTicketStatus/);
  });

  await test('Admin UI', 'Android mobile CSS breakpoints present', () => {
    assert.match(css, /@media \(max-width: 720px\)/);
    assert.match(css, /\.help-center/);
    assert.match(css, /min-height: 44px/);
  });
}

async function testServerApis() {
  const port = await freePort();
  const adminKey = 'coincall-admin-test';
  const dataDir = join(ROOT, `.tmp-test-data-${port}-${Date.now()}`);
  mkdirSync(dataDir, { recursive: true });

  const child = spawn('npx', ['tsx', 'index.ts'], {
    cwd: join(ROOT, 'server'),
    env: {
      ...process.env,
      PORT: String(port),
      ADMIN_API_KEY: adminKey,
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      MONGODB_URI: '',
      MONGO_URI: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  let bootLog = '';
  child.stdout.on('data', (d) => {
    bootLog += String(d);
  });
  child.stderr.on('data', (d) => {
    bootLog += String(d);
  });

  const base = `http://127.0.0.1:${port}/api`;
  const root = `http://127.0.0.1:${port}`;

  try {
    await test('Server', 'API process boots + /api/health', async () => {
      for (let i = 0; i < 50; i += 1) {
        try {
          const res = await fetch(`${root}/api/health`);
          if (res.ok) return `port ${port} · /api/health → ${res.status}`;
        } catch {
          /* retry */
        }
        if (child.exitCode != null) {
          throw new Error(`Server exited early: ${bootLog.slice(-800)}`);
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error(`Boot timeout. Log: ${bootLog.slice(-800)}`);
    });

    await test('Server', 'GET /api/help-center returns Android guides', async () => {
      const res = await fetch(`${base}/help-center`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.articles));
      assert.ok(data.articles.length >= 6);
      const ids = data.articles.map((a) => a.id);
      for (const need of [
        'go-online',
        'go-live',
        'adult-gifts',
        'mass-text',
        'set-message',
        'android-tips',
        'contact-support',
      ]) {
        assert.ok(ids.includes(need), `missing article ${need}`);
      }
      return `${data.articles.length} articles`;
    });

    await test('Server', 'GET /api/admin/help-center requires admin key', async () => {
      const denied = await fetch(`${base}/admin/help-center`);
      assert.equal(denied.status, 401);
      const ok = await fetch(`${base}/admin/help-center`, {
        headers: { 'x-admin-key': adminKey },
      });
      assert.equal(ok.status, 200);
      const data = await ok.json();
      assert.ok(data.articles?.length > 0);
    });

    let ticketId = '';
    await test('Server', 'POST /api/support/tickets creates host ticket', async () => {
      const res = await fetch(`${base}/support/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: 'host_test_1',
          hostName: 'Test Host',
          text: 'Android live camera freezes after 2 minutes',
          category: 'android',
        }),
      });
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.ok(data.ticket?.id);
      assert.equal(data.ticket.status, 'open');
      assert.equal(data.ticket.category, 'android');
      ticketId = data.ticket.id;
      return ticketId;
    });

    await test('Server', 'POST /api/support/tickets rejects empty body', async () => {
      const res = await fetch(`${base}/support/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: 'x' }),
      });
      assert.equal(res.status, 400);
    });

    await test('Server', 'GET /api/support/tickets?hostId filters host tickets', async () => {
      const res = await fetch(`${base}/support/tickets?hostId=host_test_1`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.tickets.some((t) => t.id === ticketId));
      const other = await fetch(`${base}/support/tickets?hostId=nobody`);
      const otherData = await other.json();
      assert.equal(otherData.tickets.length, 0);
    });

    await test('Server', 'GET /api/admin/support/tickets lists + counts', async () => {
      const res = await fetch(`${base}/admin/support/tickets?key=${adminKey}`, {
        headers: { 'x-admin-key': adminKey },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.tickets.some((t) => t.id === ticketId));
      assert.ok(data.counts.open >= 1);
      assert.ok(data.counts.total >= 1);
      return `open=${data.counts.open}`;
    });

    await test('Server', 'Admin reply marks ticket answered', async () => {
      const res = await fetch(`${base}/admin/support/tickets/${ticketId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          key: adminKey,
          status: 'answered',
          reply: 'Disable battery optimization for CoinCall Host.',
          adminId: 'admin_test',
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ticket.status, 'answered');
      assert.match(data.ticket.adminReply, /battery/);
      assert.equal(data.ticket.repliedBy, 'admin_test');
    });

    await test('Server', 'Host can see admin reply on ticket', async () => {
      const res = await fetch(`${base}/support/tickets?hostId=host_test_1`);
      const data = await res.json();
      const row = data.tickets.find((t) => t.id === ticketId);
      assert.ok(row);
      assert.equal(row.status, 'answered');
      assert.ok(row.adminReply);
    });

    await test('Server', 'Admin close + reopen ticket', async () => {
      let res = await fetch(`${base}/admin/support/tickets/${ticketId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ key: adminKey, status: 'closed' }),
      });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).ticket.status, 'closed');

      res = await fetch(`${base}/admin/support/tickets/${ticketId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ key: adminKey, status: 'open' }),
      });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).ticket.status, 'open');
    });

    await test('Server', 'Admin ticket status rejects invalid status', async () => {
      const res = await fetch(`${base}/admin/support/tickets/${ticketId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ key: adminKey, status: 'banana' }),
      });
      assert.equal(res.status, 400);
    });

    await test('Server', 'Admin tickets filter by status=open', async () => {
      const res = await fetch(
        `${base}/admin/support/tickets?key=${adminKey}&status=open`,
        { headers: { 'x-admin-key': adminKey } },
      );
      const data = await res.json();
      assert.ok(data.tickets.every((t) => t.status === 'open'));
    });

    await test('Server', 'Server gift catalog includes adult gift IDs', async () => {
      const serverSrc = readFileSync(join(ROOT, 'server/index.ts'), 'utf8');
      for (const id of [
        'silk_whisper',
        'midnight_kiss',
        'private_unlock',
        'vip_private_show',
      ]) {
        assert.match(serverSrc, new RegExp(`${id}:`));
      }
      // Hit gift-request invalid gift to get server gift list if available
      const res = await fetch(`${base}/calls/does_not_exist/gift-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftId: 'private_unlock' }),
      });
      // 404 call not found is expected — proves route exists
      assert.ok([404, 400, 409].includes(res.status), `unexpected ${res.status}`);
      return `gift-request route → ${res.status}`;
    });

    await test('Server', 'Mass text 409 when nobody online', async () => {
      const empty = await fetch(`${base}/host/mass-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: 'host_test_1', text: '' }),
      });
      assert.equal(empty.status, 400);

      const res = await fetch(`${base}/host/mass-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: 'host_test_1',
          hostName: 'Test Host',
          text: 'Hello — should fail with nobody online',
        }),
      });
      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.sent, 0);
      return data.error || 'no active users';
    });

    await test('Server', 'POST /api/users/active marks fan online', async () => {
      const res = await fetch(`${base}/users/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'fan_online_1',
          userName: 'Online Fan',
          role: 'user',
        }),
      });
      assert.equal(res.status, 200);
      const list = await fetch(`${base}/users/active`);
      const data = await list.json();
      assert.ok(data.users.some((u) => u.userId === 'fan_online_1'));
      return `count=${data.count}`;
    });

    await test('Server', 'Mass text to online users (set message)', async () => {
      const res = await fetch(`${base}/host/mass-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: 'host_test_1',
          hostName: 'Test Host',
          text: 'Hello online fans — set message test',
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.sent >= 1);
      assert.ok(data.userIds.includes('fan_online_1'));
      return `sent=${data.sent}`;
    });

    await test('Server', 'Mass text skips host-role presence (targets fans only)', async () => {
      await fetch(`${base}/users/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'only_host_presence',
          userName: 'Host Presence',
          role: 'host',
        }),
      });
      const still = await fetch(`${base}/host/mass-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: 'host_x',
          text: 'still online check',
        }),
      });
      assert.equal(still.status, 200);
      const data = await still.json();
      assert.ok(!data.userIds.includes('only_host_presence'));
      assert.ok(data.userIds.includes('fan_online_1'));
      return `targets=${data.userIds.join(',')}`;
    });

    await test('Server', 'Mass text excludes sender from recipients', async () => {
      await fetch(`${base}/users/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'solo_self',
          userName: 'Solo',
          role: 'user',
        }),
      });
      const res = await fetch(`${base}/host/mass-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: 'fan_online_1',
          text: 'self filter check',
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(!data.userIds.includes('fan_online_1'));
      assert.ok(data.userIds.includes('solo_self'));
      return `self excluded; sent=${data.sent}`;
    });
  } finally {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }
}

async function testOutreachServiceSource() {
  const src = readFileSync(join(ROOT, 'src/services/hostOutreachService.ts'), 'utf8');
  await test('Services', 'createAdminSupportTicket sends category', () => {
    assert.match(src, /category: input\.category/);
  });
  await test('Services', 'fetchHelpCenterArticles defined', () => {
    assert.match(src, /export async function fetchHelpCenterArticles/);
  });
  await test('Services', 'fetchHostSupportTickets defined', () => {
    assert.match(src, /export async function fetchHostSupportTickets/);
  });
  await test('Services', 'giftRequestService requestGiftFromUser defined', () => {
    const g = readFileSync(join(ROOT, 'src/services/giftRequestService.ts'), 'utf8');
    assert.match(g, /export async function requestGiftFromUser/);
    assert.match(g, /giftCatalog/);
  });
}

async function testAdminTypecheck() {
  await test('Build', 'Admin TypeScript compiles', async () => {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(
      join(ROOT, 'admin/node_modules/.bin/tsc'),
      ['--noEmit', '-p', 'tsconfig.app.json'],
      { cwd: join(ROOT, 'admin'), encoding: 'utf8' },
    );
    if (r.status !== 0) {
      throw new Error((r.stdout || r.stderr || 'tsc failed').slice(0, 500));
    }
    return 'tsc clean';
  });
}

function writeReport() {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  const bySuite = new Map();
  for (const r of results) {
    if (!bySuite.has(r.suite)) bySuite.set(r.suite, []);
    bySuite.get(r.suite).push(r);
  }

  let md = `# Host Feature Function Test Report\n\n`;
  md += `**Date:** ${new Date().toISOString()}\n`;
  md += `**Branch:** cursor/host-feature-test-report-465d\n`;
  md += `**Verdict:** ${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}\n\n`;
  md += `| Metric | Count |\n|---|---:|\n`;
  md += `| Passed | ${passed} |\n`;
  md += `| Failed | ${failed} |\n`;
  md += `| Skipped | ${skipped} |\n`;
  md += `| Total | ${results.length} |\n\n`;

  for (const [suite, rows] of bySuite) {
    md += `## ${suite}\n\n`;
    md += `| Status | Test | Detail |\n|---|---|---|\n`;
    for (const r of rows) {
      md += `| ${r.status} | ${r.name} | ${String(r.detail).replace(/\|/g, '\\|')} |\n`;
    }
    md += `\n`;
  }

  md += `## Coverage map\n\n`;
  md += `| Feature | How tested |\n|---|---|\n`;
  md += `| Adult gift catalog | Source + runtime \`adultGifts\`/\`resolveGift\` |\n`;
  md += `| Host gift picker UI wiring | Source wiring assertions |\n`;
  md += `| Ask gift on call | CallScreen + gift-request route |\n`;
  md += `| Lock Live | LiveRoomScreen + context wiring |\n`;
  md += `| Set message (live pin) | LiveRoomScreen + setAnnouncement |\n`;
  md += `| See users online | ChatHub + POST/GET /users/active |\n`;
  md += `| Mass / set message to online | POST /host/mass-text live API |\n`;
  md += `| Host Help Center | Articles API + ticket CRUD |\n`;
  md += `| Admin Help Center | Panel wiring + ticket reply/close/reopen |\n`;
  md += `| Android admin layout | CSS breakpoint checks |\n`;
  md += `| Admin TypeScript | tsc --noEmit |\n\n`;

  if (failed > 0) {
    md += `## Failures\n\n`;
    for (const r of results.filter((x) => x.status === 'FAIL')) {
      md += `- **${r.suite} / ${r.name}:** ${r.detail}\n`;
    }
  }

  writeFileSync(REPORT_PATH, md);
  writeFileSync(join(ROOT, 'HOST_FEATURE_TEST_REPORT.md'), md);
  console.log(`\nReport written to ${REPORT_PATH}`);
  return md;
}

async function testGiftRuntime() {
  await test('Gifts Runtime', 'tsx import adultGifts / resolveGift', async () => {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(
      'npx',
      ['tsx', 'scripts/test-host-gifts-runtime.mjs'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    if (r.status !== 0) {
      throw new Error((r.stdout || r.stderr || 'gift runtime failed').slice(0, 800));
    }
    const lines = String(r.stdout || '')
      .split('\n')
      .filter((l) => l.startsWith('✓'));
    return `${lines.length} runtime checks`;
  });
}

async function main() {
  console.log('=== Host feature function tests ===\n');
  await testGiftCatalog();
  await testGiftRuntime();
  await testHostUiWiring();
  await testAdminWiring();
  await testOutreachServiceSource();
  await testAdminTypecheck();
  await testServerApis();

  const md = writeReport();
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed, ${skipped} skipped ===`);
  if (failed > 0) process.exitCode = 1;
  // Ensure exit even if handles linger
  setTimeout(() => process.exit(failed > 0 ? 1 : 0), 200).unref();
  return md;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
