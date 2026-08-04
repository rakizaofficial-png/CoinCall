import { createVerify } from 'crypto';

const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CLOCK_SKEW_SECONDS = 300;

type FirebaseTokenHeader = {
  alg?: unknown;
  kid?: unknown;
};

export type FirebaseTokenClaims = {
  aud?: unknown;
  iss?: unknown;
  sub?: unknown;
  exp?: unknown;
  iat?: unknown;
  auth_time?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
  firebase?: {
    sign_in_provider?: unknown;
  };
};

export type VerifiedGoogleIdentity = {
  firebaseUid: string;
  email: string;
  displayName: string;
  picture?: string;
};

let cachedCertificates: Record<string, string> = {};
let certificateExpiryMs = 0;

function decodeJsonPart<T>(part: string): T {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
  } catch {
    throw new Error('Malformed identity token');
  }
}

function readNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid ${field} claim`);
  return number;
}

export function validateFirebaseClaims(
  claims: FirebaseTokenClaims,
  options: {
    projectId?: string;
    nowSeconds?: number;
    requiredProvider?: string;
  } = {},
): VerifiedGoogleIdentity {
  const projectId =
    String(options.projectId || process.env.FIREBASE_PROJECT_ID || 'lovecall-2291e').trim();
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const requiredProvider = options.requiredProvider ?? 'google.com';
  const subject = String(claims.sub || '').trim();
  const email = String(claims.email || '').trim().toLowerCase();
  const expiresAt = readNumber(claims.exp, 'exp');
  const issuedAt = readNumber(claims.iat, 'iat');
  const authenticatedAt = readNumber(claims.auth_time, 'auth_time');

  if (!projectId) throw new Error('Firebase project is not configured');
  if (claims.aud !== projectId) throw new Error('Identity token audience mismatch');
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Identity token issuer mismatch');
  }
  if (!subject || subject.length > 128) throw new Error('Invalid identity subject');
  if (expiresAt <= nowSeconds) throw new Error('Identity token expired');
  if (issuedAt > nowSeconds + CLOCK_SKEW_SECONDS) throw new Error('Identity token issued in future');
  if (authenticatedAt > nowSeconds + CLOCK_SKEW_SECONDS) {
    throw new Error('Identity authentication time is in future');
  }
  if (!email || claims.email_verified !== true) {
    throw new Error('A verified email is required');
  }
  if (requiredProvider && claims.firebase?.sign_in_provider !== requiredProvider) {
    throw new Error('Google sign-in provider required');
  }

  return {
    firebaseUid: subject,
    email,
    displayName: String(claims.name || '').trim().slice(0, 40) || email.split('@')[0] || 'Luma User',
    picture: typeof claims.picture === 'string' ? claims.picture : undefined,
  };
}

async function getFirebaseCertificates(): Promise<Record<string, string>> {
  if (certificateExpiryMs > Date.now() && Object.keys(cachedCertificates).length) {
    return cachedCertificates;
  }
  const response = await fetch(FIREBASE_CERTS_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Could not load identity certificates');
  const certificates = (await response.json()) as Record<string, string>;
  if (!certificates || typeof certificates !== 'object') {
    throw new Error('Invalid identity certificate response');
  }
  const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 3600);
  cachedCertificates = certificates;
  certificateExpiryMs = Date.now() + Math.max(60, maxAge) * 1000;
  return certificates;
}

export async function verifyGoogleFirebaseIdToken(
  idToken: string,
): Promise<VerifiedGoogleIdentity> {
  const token = String(idToken || '').trim();
  if (!token || token.length > 16_384) throw new Error('Identity token required');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed identity token');
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeJsonPart<FirebaseTokenHeader>(encodedHeader);
  const claims = decodeJsonPart<FirebaseTokenClaims>(encodedClaims);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new Error('Unsupported identity token');
  }

  const certificates = await getFirebaseCertificates();
  const certificate = certificates[header.kid];
  if (!certificate) throw new Error('Unknown identity signing key');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedClaims}`);
  verifier.end();
  const signatureValid = verifier.verify(certificate, Buffer.from(encodedSignature, 'base64url'));
  if (!signatureValid) throw new Error('Invalid identity signature');

  return validateFirebaseClaims(claims);
}
