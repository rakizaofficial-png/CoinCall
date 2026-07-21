/**
 * Structural verification for android-host module.
 * Run: node scripts/verify-android-host.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'android-host');
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith('.kt')) acc.push(p);
  }
  return acc;
}

const files = walk(join(root, 'app/src/main/java'));
const blob = files.map((f) => readFileSync(f, 'utf8')).join('\n');
const checks = [
  ['Material 3 theme', /CoinCallHostTheme/],
  ['Hilt app', /@HiltAndroidApp/],
  ['Bottom nav', /NavigationBar/],
  ['Encrypted tokens', /EncryptedSharedPreferences/],
  ['Root detection', /isRooted/],
  ['Host API scoped', /interface HostApi/],
  ['No admin wallet edit API', /admin\/wallets/],
  ['Withdraw gateways', /easypaisa/],
  ['Help center API', /help-center/],
  ['FLAG_SECURE', /FLAG_SECURE/],
];

let failed = 0;
for (const [name, re] of checks) {
  const invert = name.startsWith('No ');
  const hit = re.test(blob);
  const ok = invert ? !hit : hit;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${files.length} Kotlin files · ${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' failed'}`);
process.exit(failed ? 1 : 0);
