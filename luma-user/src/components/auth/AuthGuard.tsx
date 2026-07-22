"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/register"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isPublicPath(pathname) && !isAuthenticated()) {
      router.replace("/login");
    }
  }, [pathname, router]);

  // On public paths, always render; on protected paths render only if authenticated.
  if (!isPublicPath(pathname) && typeof window !== "undefined" && !isAuthenticated()) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="text-sm text-muted">Loading…</span>
      </div>
    );
  }

  return <>{children}</>;
}
