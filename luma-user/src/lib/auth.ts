/**
 * Auth helpers — email+password login/register using CoinCall API.
 * POST /api/users/register  { email, password, displayName }
 * POST /api/users/login     { email, password }
 * Tokens stored in localStorage; X-User-Id header uses returned userId.
 */

import { requireApiBase, apiConfig } from "@/config/apiConfig";

const TOKEN_KEY = "luma_auth_token";
const USER_ID_KEY = "luma_auth_user_id";
const DISPLAY_NAME_KEY = "luma_auth_display_name";
const EMAIL_KEY = "luma_auth_email";

export type AuthUser = {
  userId: string;
  email: string;
  displayName: string;
  token: string;
};

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getAuthUserId(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(USER_ID_KEY); } catch { return null; }
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const userId = localStorage.getItem(USER_ID_KEY);
    const email = localStorage.getItem(EMAIL_KEY) ?? "";
    const displayName = localStorage.getItem(DISPLAY_NAME_KEY) ?? "";
    if (!token || !userId) return null;
    return { token, userId, email, displayName };
  } catch { return null; }
}

export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}

function saveAuth(user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, user.token);
  localStorage.setItem(USER_ID_KEY, user.userId);
  localStorage.setItem(EMAIL_KEY, user.email);
  localStorage.setItem(DISPLAY_NAME_KEY, user.displayName);
  // Migrate device user id to account id so wallet/chat continue working
  localStorage.setItem(apiConfig.deviceUserKey, user.userId);
}

export function logout() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(DISPLAY_NAME_KEY);
  } catch { /* ignore */ }
}

export async function register(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthUser> {
  const base = requireApiBase();
  const res = await fetch(`${base}/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName }),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : `Register failed (${res.status})`,
    );
  }
  const user: AuthUser = {
    token: String(data.token ?? data.accessToken ?? ""),
    userId: String(data.userId ?? data.id ?? ""),
    email: String(data.email ?? email),
    displayName: String(data.displayName ?? displayName),
  };
  if (!user.token || !user.userId) {
    throw new Error("Server returned incomplete auth data");
  }
  saveAuth(user);
  return user;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthUser> {
  const base = requireApiBase();
  const res = await fetch(`${base}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : `Login failed (${res.status})`,
    );
  }
  const user: AuthUser = {
    token: String(data.token ?? data.accessToken ?? ""),
    userId: String(data.userId ?? data.id ?? ""),
    email: String(data.email ?? email),
    displayName: String(data.displayName ?? email.split("@")[0]),
  };
  if (!user.token || !user.userId) {
    throw new Error("Server returned incomplete auth data");
  }
  saveAuth(user);
  return user;
}
