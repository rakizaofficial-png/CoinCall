"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Radio, Video, MessageCircle, UserRound } from "lucide-react";
import { motion } from "framer-motion";
import { useApp } from "@/lib/store";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/live", label: "Live", icon: Radio },
  { href: "/call", label: "Calling", icon: Video },
  { href: "/messages", label: "Chat", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function BottomNav() {
  const pathname = usePathname();
  const { unreadInbox } = useApp();

  const hide =
    pathname.startsWith("/live/") ||
    pathname.startsWith("/call/") ||
    pathname.startsWith("/messages/") ||
    pathname.startsWith("/party/") ||
    pathname === "/premium" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register");

  if (hide) return null;

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-line bg-ink/92 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <ul className="grid grid-cols-5 gap-1 py-2">
        {tabs.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          const badge = tab.href === "/messages" && unreadInbox > 0 ? unreadInbox : 0;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className="relative flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium"
              >
                {active && (
                  <motion.span
                    layoutId="nav-glow"
                    className="absolute inset-0 rounded-2xl bg-coral/18"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative">
                  <Icon
                    className={`relative h-5 w-5 ${active ? "text-coral" : "text-muted"}`}
                    strokeWidth={active ? 2.4 : 1.8}
                  />
                  {badge > 0 && (
                    <span className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-coral px-1 text-[9px] font-bold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span
                  className={
                    active ? "relative text-sand" : "relative text-muted"
                  }
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
