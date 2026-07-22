"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { CHAT_THEME } from "./chatTheme";

/** Locks layout: header + scroll body + fixed composer. Keyboard only resizes the scroll area. */
export function ChatThreadLayout({
  header,
  children,
  composer,
  scrollRef: externalScrollRef,
}: {
  header: ReactNode;
  children: ReactNode;
  composer: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  const internalRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef ?? internalRef;
  const [kbOffset, setKbOffset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const onResize = () => {
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbOffset(gap);
    };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  return (
    <main
      className="flex h-dvh flex-col overflow-hidden"
      style={{ backgroundColor: CHAT_THEME.bg }}
    >
      <header
        className="z-20 shrink-0 border-b backdrop-blur-xl"
        style={{
          borderColor: CHAT_THEME.border,
          backgroundColor: CHAT_THEME.headerBg,
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        }}
      >
        {header}
      </header>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {children}
      </div>
      <div className="shrink-0" style={{ transform: kbOffset ? `translateY(-${kbOffset}px)` : undefined }}>
        {composer}
      </div>
    </main>
  );
}
