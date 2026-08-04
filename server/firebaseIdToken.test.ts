import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFirebaseClaims, type FirebaseTokenClaims } from './firebaseIdToken.ts';

const projectId = 'test-firebase-project';
const nowSeconds = 2_000_000_000;

function claims(overrides: Partial<FirebaseTokenClaims> = {}): FirebaseTokenClaims {
  return {
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: 'firebase-user-123',
    exp: nowSeconds + 3600,
    iat: nowSeconds - 30,
    auth_time: nowSeconds - 60,
    email: 'verified@example.com',
    email_verified: true,
    name: 'Verified User',
    firebase: { sign_in_provider: 'google.com' },
    ...overrides,
  };
}

test('accepts valid Google Firebase claims and returns trusted identity fields', () => {
  const identity = validateFirebaseClaims(claims(), { projectId, nowSeconds });
  assert.deepEqual(identity, {
    firebaseUid: 'firebase-user-123',
    email: 'verified@example.com',
    displayName: 'Verified User',
    picture: undefined,
  });
});

test('rejects expired, wrong-project, and non-Google identity claims', () => {
  assert.throws(
    () => validateFirebaseClaims(claims({ exp: nowSeconds }), { projectId, nowSeconds }),
    /expired/,
  );
  assert.throws(
    () => validateFirebaseClaims(claims({ aud: 'another-project' }), { projectId, nowSeconds }),
    /audience/,
  );
  assert.throws(
    () => validateFirebaseClaims(claims({ firebase: { sign_in_provider: 'password' } }), { projectId, nowSeconds }),
    /Google sign-in provider/,
  );
});

test('rejects an unverified email even when other token claims are valid', () => {
  assert.throws(
    () => validateFirebaseClaims(claims({ email_verified: false }), { projectId, nowSeconds }),
    /verified email/,
  );
});
