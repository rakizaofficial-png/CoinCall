import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authenticateUserToken,
  bearerToken,
  getUserAccountById,
  loginUser,
  logoutUserToken,
  registerUser,
} from './userAuth.ts';

test('email registration persists a named account with a verifiable session', () => {
  const email = `user-${Date.now()}@example.com`;
  const result = registerUser({
    email,
    password: 'secret1',
    displayName: 'Test User',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.account.email, email);
  assert.equal(result.account.displayName, 'Test User');
  assert.equal(getUserAccountById(result.account.userId)?.email, email);
  assert.equal(authenticateUserToken(result.account.token)?.userId, result.account.userId);
});

test('logging in on another device keeps a bounded set of valid sessions', () => {
  const email = `multi-${Date.now()}@example.com`;
  const registered = registerUser({
    email,
    password: 'secret2',
    displayName: 'Multi Device',
  });
  assert.equal(registered.ok, true);
  if (!registered.ok) return;

  const originalToken = registered.account.token;
  const loggedIn = loginUser({ email, password: 'secret2' });
  assert.equal(loggedIn.ok, true);
  if (!loggedIn.ok) return;

  assert.notEqual(loggedIn.account.token, originalToken);
  assert.equal(authenticateUserToken(originalToken)?.userId, registered.account.userId);
  assert.equal(authenticateUserToken(loggedIn.account.token)?.userId, registered.account.userId);
  assert.ok((loggedIn.account.tokens?.length || 0) <= 5);
});

test('invalid passwords and malformed bearer headers are rejected', () => {
  const email = `invalid-${Date.now()}@example.com`;
  const registered = registerUser({
    email,
    password: 'secret3',
    displayName: 'Invalid Test',
  });
  assert.equal(registered.ok, true);
  assert.equal(loginUser({ email, password: 'wrong-password' }).ok, false);
  assert.equal(bearerToken('Token abc'), '');
  assert.equal(bearerToken('Bearer abc123'), 'abc123');
});

test('logout revokes only the selected device session', () => {
  const email = `logout-${Date.now()}@example.com`;
  const registered = registerUser({
    email,
    password: 'secret4',
    displayName: 'Logout Test',
  });
  assert.equal(registered.ok, true);
  if (!registered.ok) return;
  const firstToken = registered.account.token;
  const second = loginUser({ email, password: 'secret4' });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const secondToken = second.account.token;

  assert.equal(logoutUserToken(secondToken), true);
  assert.equal(authenticateUserToken(secondToken), undefined);
  assert.equal(authenticateUserToken(firstToken)?.userId, registered.account.userId);
});
