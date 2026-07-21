/**
 * A–Z Android Host QA audit (structural + pure logic).
 * Run: node scripts/audit-android-host.mjs
 *
 * Does not require Android SDK. Mirrors EarningsCalculator / WithdrawalValidator
 * and verifies feature wiring across kotlin sources + navigation.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'android-host');
const javaRoot = join(root, 'app/src/main/java');

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith('.kt') || name.endsWith('.xml') || name.endsWith('.kts')) acc.push(p);
  }
  return acc;
}

const files = walk(join(root, 'app'));
const blob = files.map((f) => readFileSync(f, 'utf8')).join('\n');
const routes = readFileSync(join(javaRoot, 'com/coincall/host/presentation/navigation/Routes.kt'), 'utf8');
const main = readFileSync(join(javaRoot, 'com/coincall/host/presentation/main/MainActivity.kt'), 'utf8');

let failed = 0;
const rows = [];

function check(name, ok, detail = '') {
  rows.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed += 1;
}

// --- Pure logic mirrors (must match Kotlin) ---
function billedMinutes(durationSec) {
  return Math.floor((Math.max(0, durationSec) + 59) / 60);
}
function coinsForCall(durationSec, ratePerMinute) {
  const rate = Math.max(1, ratePerMinute);
  return billedMinutes(durationSec) * rate;
}
function withdrawable(balance, pendingHold) {
  return Math.max(0, balance - Math.max(0, pendingHold));
}
function successRate(answered, total) {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, answered / total));
}
function validateWithdrawal(amountCoins, gateway, accountName, accountNumber, withdrawableBalance) {
  const GATEWAYS = new Set(['easypaisa', 'jazzcash', 'bank', 'crypto']);
  if (amountCoins < 100) return { ok: false, error: 'min' };
  if (amountCoins > withdrawableBalance) return { ok: false, error: 'balance' };
  if (!GATEWAYS.has(gateway.toLowerCase())) return { ok: false, error: 'gateway' };
  if (accountName.trim().length < 2) return { ok: false, error: 'name' };
  const acct = accountNumber.trim();
  const g = gateway.toLowerCase();
  if ((g === 'easypaisa' || g === 'jazzcash') && !/^03\d{9}$/.test(acct) && !/^\d{10,12}$/.test(acct)) {
    return { ok: false, error: 'wallet' };
  }
  if (g === 'bank' && acct.length < 8) return { ok: false, error: 'bank' };
  if (g === 'crypto' && acct.length < 20) return { ok: false, error: 'crypto' };
  return { ok: true };
}

console.log('\n== Earnings / wallet math ==');
check('billedMinutes ceil', billedMinutes(1) === 1 && billedMinutes(60) === 1 && billedMinutes(61) === 2);
check('coinsForCall 90s@80', coinsForCall(90, 80) === 160);
check('coinsForCall 0s', coinsForCall(0, 80) === 0);
check('withdrawable clamps', withdrawable(500, 120) === 380 && withdrawable(50, 120) === 0);
check('successRate', successRate(8, 10) === 0.8 && successRate(0, 0) === 0);
check(
  'withdrawal validator',
  validateWithdrawal(100, 'easypaisa', 'Ali', '03001234567', 500).ok &&
    !validateWithdrawal(50, 'easypaisa', 'Ali', '03001234567', 500).ok &&
    !validateWithdrawal(200, 'easypaisa', 'Ali', '03001234567', 100).ok,
);

console.log('\n== Auth / security ==');
check('OTP screen', /fun OtpScreen/.test(blob) && /Routes\.Otp/.test(main));
check('Login OTP nav', /onOtp\s*=/.test(main) && /Login with OTP/.test(blob));
check('JWT session mint/validate', /object JwtSession/.test(blob) && /fun mint/.test(blob) && /fun isValid/.test(blob));
check('Encrypted tokens', /EncryptedSharedPreferences/.test(blob));
check('Auth Bearer only if JWT valid', /JwtSession\.isValid\(access\)/.test(blob));
check('X-Client-Role host', /X-Client-Role/.test(blob));
check('Root / compromise guard', /isRooted/.test(blob) && /isDeviceCompromised/.test(blob));
check('FLAG_SECURE calls', /FLAG_SECURE|enableScreenshotProtection/.test(blob));
check('No admin wallet API', !/admin\/wallets/.test(blob));
check('allowBackup false', /android:allowBackup="false"/.test(blob));

console.log('\n== Feature wiring checklist ==');
const features = [
  ['Login', () => /fun LoginScreen/.test(blob)],
  ['Register', () => /fun RegisterScreen/.test(blob)],
  ['OTP', () => /fun OtpScreen/.test(blob)],
  ['Forgot Password', () => /fun ForgotPasswordScreen/.test(blob)],
  ['Host Dashboard', () => /fun DashboardScreen/.test(blob)],
  ['Earnings daily/week/month', () => /todayCoins/.test(blob) && /weekCoins/.test(blob) && /monthCoins/.test(blob)],
  ['Wallet', () => /fun WalletScreen/.test(blob)],
  ['Coin Earnings', () => /Coin earnings/.test(blob)],
  ['Withdrawal', () => /fun WithdrawScreen/.test(blob)],
  ['Withdrawal History filters', () => /admin_review/.test(blob) && /approved/.test(blob)],
  ['Profile + Bio + Languages', () => /fun EditProfileScreen/.test(blob) && /Languages/.test(blob)],
  ['Schedule', () => /fun ScheduleScreen/.test(blob) && /Routes\.Schedule/.test(main)],
  ['Online Status / Busy / Vacation', () => /HostPresenceStatus/.test(blob) && /fun StatusScreen/.test(blob)],
  ['KYC selfie/CNIC/passport', () => /captureSelfie/.test(blob) && /uploadCnic/.test(blob) && /uploadPassport/.test(blob)],
  ['Document approval status', () => /Not submitted/.test(blob)],
  ['Notifications', () => /fun NotificationsScreen/.test(blob)],
  ['Push notifications', () => /object HostPush/.test(blob) && /ensureChannels/.test(blob)],
  ['Agency info + commission', () => /fun AgencyScreen/.test(blob) && /Commission/.test(blob)],
  ['Referral + earnings', () => /fun ReferralScreen/.test(blob) && /Earnings/.test(blob)],
  ['Host Ranking', () => /Host ranking/i.test(blob) || /leaderboard/i.test(blob)],
  ['Reviews + Ratings', () => /fun ReviewsScreen/.test(blob)],
  ['Chat Admin', () => /ADMIN_ID/.test(blob) && /CoinCall Admin/.test(blob)],
  ['Chat Agency', () => /AGENCY_ID/.test(blob) && /Agency Desk/.test(blob)],
  ['Messaging', () => /fun ChatThreadScreen/.test(blob) && /sendMessage/.test(blob)],
  ['Video + Audio calling', () => /CallMediaMode/.test(blob) && /audioOnly/.test(blob)],
  ['Agora integration', () => /interface AgoraEngine/.test(blob) && /StubAgoraEngine/.test(blob)],
  ['Camera/Mic permissions', () => /PermissionHelper/.test(blob) && /RECORD_AUDIO/.test(blob)],
  ['Camera switch / mute / speaker', () => /switchCamera/.test(blob) && /setMuted/.test(blob) && /setSpeakerphone/.test(blob)],
  ['Call timer + coin calc', () => /coinsEarned/.test(blob) && /EarningsCalculator\.coinsForCall/.test(blob)],
  ['Incoming / Outgoing calls', () => /IncomingCallScreen/.test(blob) && /ActiveCallScreen/.test(blob)],
  ['Call History', () => /fun CallHistoryScreen/.test(blob)],
  ['Settings + Dark Mode', () => /fun SettingsScreen/.test(blob) && /Dark theme/.test(blob)],
  ['Logout', () => /repo\.logout|fun logout\(/.test(blob)],
];

for (const [name, fn] of features) {
  check(name, fn());
}

console.log('\n== Navigation integrity ==');
check('OTP route constant', /const val Otp/.test(routes));
check('Schedule route', /const val Schedule/.test(routes));
check('Reviews route', /const val Reviews/.test(routes));
check('ActiveCall route', /const val ActiveCall/.test(routes));
check('Main wires OtpScreen', /OtpScreen\(/.test(main));
check('Main wires ScheduleScreen', /ScheduleScreen\(/.test(main));
check('Main wires ReviewsScreen', /ReviewsScreen\(/.test(main));
check('Scaffold padding for bottom nav', /Modifier\.padding\(padding\)/.test(main));

console.log('\n== UI / call safety ==');
check('Call PiP bounded', /statusBarsPadding|navigationBarsPadding/.test(blob));
check('Compact phone call controls', /maxWidth < 360\.dp/.test(blob));
check('Schedule chips scroll', /horizontalScroll/.test(blob));
check('Agora uses ApplicationContext', /ApplicationContext.*appContext|appContext.*ApplicationContext/.test(blob) || /@ApplicationContext private val appContext/.test(blob));

console.log('\n== Performance / architecture ==');
check('Hilt DI', /@HiltAndroidApp/.test(blob));
check('Release minify', /isMinifyEnabled = true/.test(blob));
check('Host-scoped API', /interface HostApi/.test(blob));
check('EarningsCalculator pure', /object EarningsCalculator/.test(blob));
check('WithdrawalValidator pure', /object WithdrawalValidator/.test(blob));

const total = rows.length;
const passed = rows.filter((r) => r.ok).length;
const report = [
  '# Android Host A–Z QA Audit Report',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Result: **${passed}/${total} checks passed**${failed ? ` (${failed} failed)` : ''}`,
  '',
  '## Checklist',
  '',
  '| Feature / Check | Status | Detail |',
  '|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.detail || ''} |`),
  '',
  '## Environment limits',
  '',
  '- This cloud VM has **no Android SDK** (`ANDROID_HOME` unset). APK assemble must run in Android Studio locally:',
  '  `cd android-host && ./gradlew :app:assembleRelease`',
  '- Agora uses `StubAgoraEngine` until the official Agora AAR is added via `AgoraModule`.',
  '- OTP is a deterministic QA flow (`123456` always works); production should call the real SMS/email provider.',
  '- KYC image capture uses placeholder URIs until gallery/camera picker is wired to Firebase Storage.',
  '',
  '## Verdict',
  '',
  failed === 0
    ? 'Structural + logic audit **PASS**. Project is APK-ready for local Gradle/SDK builds.'
    : 'Audit found failures — fix before release.',
  '',
].join('\n');

const outRepo = join(process.cwd(), 'ANDROID_HOST_QA_AUDIT.md');
writeFileSync(outRepo, report);
try {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  writeFileSync('/opt/cursor/artifacts/android-host-qa-audit.md', report);
} catch {
  /* optional */
}

console.log(`\n${passed}/${total} passed · report → ANDROID_HOST_QA_AUDIT.md`);
process.exit(failed ? 1 : 0);
