import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'crypto';

export type StaffTokenPayload =
  | { kind: 'admin'; role: string; exp: number }
  | { kind: 'agency'; agencyId: string; exp: number };

const secret =
  process.env.STAFF_SESSION_SECRET ||
  process.env.ADMIN_API_KEY ||
  'development-only-change-me';

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function signature(encoded: string) {
  return createHmac('sha256', secret).update(encoded).digest('base64url');
}

export function issueStaffToken(
  payload:
    | { kind: 'admin'; role: string }
    | { kind: 'agency'; agencyId: string },
  ttlSeconds = 60 * 60 * 12,
) {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  } as StaffTokenPayload;
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${encoded}.${signature(encoded)}`;
}

export function verifyStaffToken(token: string): StaffTokenPayload | null {
  const [encoded, sig] = String(token || '').split('.');
  if (!encoded || !sig || !safeEqual(signature(encoded), sig)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as StaffTokenPayload;
    if (!payload?.kind || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function requestStaffToken(req: {
  headers: Record<string, unknown>;
  query?: Record<string, unknown>;
}) {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-admin-key'] || req.query?.key || '').trim();
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, digest] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !digest) return false;
  const actual = scryptSync(password, salt, 64).toString('hex');
  return safeEqual(actual, digest);
}

export function strongPassword(password: string) {
  return (
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function verifyAdminCredentials(email: string, password: string) {
  const expectedEmail = String(process.env.ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();
  const expectedPassword = String(process.env.ADMIN_PASSWORD || '');
  if (!expectedEmail || !expectedPassword) return false;
  return (
    safeEqual(email.trim().toLowerCase(), expectedEmail) &&
    safeEqual(password, expectedPassword)
  );
}
