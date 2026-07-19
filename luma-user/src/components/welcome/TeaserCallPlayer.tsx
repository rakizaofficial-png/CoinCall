"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import type { WelcomePushHost } from "@/lib/welcomePush/config";

/**
 * Hidden immersive teaser player — no controls / scrubber.
 * Parent hard-cuts at 3.5s into PAYWALL_BOOST.
 */
export function TeaserCallPlayer({
  host,
  onHardCut,
}: {
  host: WelcomePushHost;
  onHardCut?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.controls = false;
    el.playsInline = true;
    el.muted = false;
    const play = async () => {
      try {
        await el.play();
      } catch {
        el.muted = true;
        try {
          await el.play();
        } catch {
          onHardCut?.();
        }
      }
    };
    void play();
  }, [onHardCut]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] mx-auto w-full max-w-[430px] overflow-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <video
        ref={videoRef}
        src={host.teaser_video_url}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        playsInline
        controls={false}
        disablePictureInPicture
        controlsList="nodownload noplaybackrate noremoteplayback"
        preload="auto"
      />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/40 via-transparent to-black/70" />
      {/* Block taps so user can’t pause the “live” feed */}
      <div className="absolute inset-0 z-[3]" />

      <div className="absolute left-4 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 backdrop-blur">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-white">
          Live · Private
        </span>
      </div>

      <div className="absolute bottom-10 left-0 right-0 z-10 flex flex-col items-center px-6">
        <div className="mb-3 overflow-hidden rounded-full ring-2 ring-cyan/50">
          <Image
            src={host.avatar}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 object-cover"
          />
        </div>
        <p className="font-display text-xl font-extrabold text-white">
          {host.name}
        </p>
        <p className="mt-1 text-xs font-semibold text-cyan/80">
          Connected · crystal clear
        </p>
      </div>
    </motion.div>
  );
}
