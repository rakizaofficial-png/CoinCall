"use client";

import { useEffect, useRef, useState } from "react";
import type { AiHostRecord } from "@/lib/aiHosts/types";

type Phase = "intro" | "loop";

/**
 * Hidden full-screen “live” video layer.
 * No spinner, no scrubber, no native controls — looks like a front-camera feed.
 *
 * CLOUD BUCKET: aiHost.video_url_1 / video_url_2 should point at your bucket clips.
 */
export function FakeLiveVideoPlayer({
  aiHost,
  active,
  muted = false,
  className = "",
}: {
  aiHost: AiHostRecord;
  active: boolean;
  muted?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [src, setSrc] = useState(aiHost.video_url_1);

  useEffect(() => {
    if (!active) return;
    setPhase("intro");
    setSrc(aiHost.video_url_1);
  }, [active, aiHost.host_id, aiHost.video_url_1]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !active) return;

    el.muted = muted;
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    // Hide any native UI chrome
    el.controls = false;
    el.disablePictureInPicture = true;

    const tryPlay = async () => {
      try {
        await el.play();
      } catch {
        // Autoplay policies: mute then retry (still looks like live video)
        el.muted = true;
        try {
          await el.play();
        } catch {
          /* keep poster frame — no spinner */
        }
      }
    };

    void tryPlay();
  }, [active, src, muted]);

  const onEnded = () => {
    if (phase === "intro") {
      setPhase("loop");
      setSrc(aiHost.video_url_2);
    }
  };

  if (!active) return null;

  return (
    <div
      className={`absolute inset-0 z-[1] overflow-hidden bg-black ${className}`}
      aria-hidden
    >
      {/* Soft vignette so it reads as a camera feed, not a media player */}
      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/25 via-transparent to-black/50" />
      <video
        ref={videoRef}
        key={src}
        src={src}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        playsInline
        muted={muted}
        loop={phase === "loop"}
        controls={false}
        disablePictureInPicture
        preload="auto"
        onEnded={onEnded}
        // Prevent long-press download UI on some mobile browsers
        controlsList="nodownload noplaybackrate noremoteplayback"
        style={{
          // Kill default media appearance
          background: "#000",
        }}
      />
      {/* Invisible hit-blocker so users can’t accidentally pause the “live” feed */}
      <div className="absolute inset-0 z-[3]" />
    </div>
  );
}
