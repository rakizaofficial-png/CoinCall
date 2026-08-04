"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AUTH_CHANGED_EVENT, getAuthUser } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/register"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

function authSnapshot() {
  const user = getAuthUser();
  return user ? `${user.userId}:${user.token}` : "";
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
  const authenticated = Boolean(authState);

  useEffect(() => {
    if (publicPath && authenticated) {
      router.replace("/");
    } else if (!publicPath && !authenticated) {
      router.replace("/login");
    }
  }, [authenticated, publicPath, router]);

  if (!publicPath && !authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="text-sm text-muted">Loading…</span>
      </div>
    );
  }

  return <>{children}</>;
}
