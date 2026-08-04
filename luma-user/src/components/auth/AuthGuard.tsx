"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AUTH_CHANGED_EVENT, getAuthUser, validateStoredSession } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/register"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function authSnapshot() {
  const user = getAuthUser();
  return user ? userSnapshot(user.userId, user.token) : "";
}

function userSnapshot(userId: string, token: string) {
  return `${userId}:${token}`;
}

function subscribeAuth(onChange: () => void) {
  window.addEventListener(AUTH_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const authState = useSyncExternalStore(subscribeAuth, authSnapshot, () => "");
  const publicPath = isPublicPath(pathname);
  const [validatedAuthState, setValidatedAuthState] = useState<string | null>(null);
  const valid = Boolean(authState) && validatedAuthState === authState;
  const checking = Boolean(authState) && !valid;

  useEffect(() => {
    let active = true;
    if (!authState) {
      if (!publicPath) router.replace("/login");
      return () => { active = false; };
    }

    void validateStoredSession().then((user) => {
      if (!active) return;
      if (!user) {
        if (!publicPath) router.replace("/login");
        return;
      }
      setValidatedAuthState(userSnapshot(user.userId, user.token));
      if (publicPath) router.replace("/");
    });
    return () => { active = false; };
  }, [authState, publicPath, router]);

  if (checking || (valid && publicPath) || (!authState && !publicPath)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="text-sm text-muted">Checking account…</span>
      </div>
    );
  }

  return <>{children}</>;
}
