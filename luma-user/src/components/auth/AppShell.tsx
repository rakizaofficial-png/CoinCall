"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { ToastHost } from "@/components/ToastHost";
import { DiamondEntranceBlast } from "@/components/DiamondEntranceBlast";
import { WelcomePushEngine } from "@/components/welcome/WelcomePushEngine";

const AUTH_PATHS = new Set(["/login", "/register"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const authPage = AUTH_PATHS.has(pathname);

  return (
    <div className="phone-shell safe-bottom relative overflow-hidden">
      {!authPage && <DiamondEntranceBlast />}
      {children}
      {!authPage && <BottomNav />}
      <ToastHost />
      {!authPage && <WelcomePushEngine />}
    </div>
  );
}
