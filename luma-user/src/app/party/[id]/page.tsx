"use client";

import { use, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Gift, Phone, Users } from "lucide-react";
import { GiftSheet } from "@/components/GiftSheet";
import { LoungeShell } from "@/components/LoungeShell";
import { WalletDiamond } from "@/components/WalletDiamond";
import { creators } from "@/lib/data";
import { fetchLiveHosts } from "@/lib/api";
import { resolveHostActivity } from "@/lib/hostActivity";
import { useApp } from "@/lib/store";

const SEAT_AVATARS = [
  "https://i.pravatar.cc/120?u=party-a",
  "https://i.pravatar.cc/120?u=party-b",
  "https://i.pravatar.cc/120?u=party-c",
  "https://i.pravatar.cc/120?u=party-d",
  "https://i.pravatar.cc/120?u=party-e",
];

export default function PartyAudiencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { pushToast } = useApp();
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftsToday, setGiftsToday] = useState(1840);
  const [hostName, setHostName] = useState("Host");
  const [hostImage, setHostImage] = useState(
    `https://i.pravatar.cc/800?u=${encodeURIComponent(id)}`,
  );
  const activity = useMemo(() => resolveHostActivity(id, { isLive: true }), [id]);

  useEffect(() => {
    const demo = creators.find((c) => c.id === id);
    if (demo) {
      setHostName(demo.name);
      setHostImage(demo.image);
    }
    void fetchLiveHosts()
      .then((hosts) => {
        const h = hosts.find((x) => x.id === id);
        if (h) {
          setHostName(h.name);
          if (h.avatarUrl) setHostImage(h.avatarUrl);
        }
      })
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => {
      setGiftsToday((g) => g + Math.floor(Math.random() * 5));
    }, 1800);
    return () => clearInterval(t);
  }, []);

  const seats = 4 + (id.length % 3);

  return (
      <LoungeShell minuteRate={60} enableAutoTopUp={false}>
      <main className="relative min-h-dvh overflow-hidden bg-[#06040b]">
        <Image
          src={hostImage}
          alt={hostName}
          fill
          priority
          className="object-cover brightness-50"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#06040b]/70 via-transparent to-[#06040b]" />

        <div className="relative z-10 flex min-h-dvh flex-col px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="rounded-full border border-cyan/30 bg-black/50 p-2 text-cyan backdrop-blur"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="rounded-full border border-cyan/40 bg-cyan/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-cyan shadow-[0_0_16px_rgba(0,240,255,0.35)]">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Audience · Party Room
              </span>
            </div>
            <WalletDiamond compact />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 rounded-2xl border border-gold/45 bg-black/55 px-4 py-3 shadow-[0_0_24px_rgba(255,184,0,0.3)] backdrop-blur"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-gold">
              Total Group Gifts Received Today
            </p>
            <p className="font-display text-2xl font-extrabold text-gold">
              🎁 {giftsToday.toLocaleString()}
            </p>
          </motion.div>

          <div className="mt-6">
            <h1 className="font-display text-3xl font-extrabold text-white">
              {hostName}&apos;s Party
            </h1>
            <p className="mt-1 text-sm text-cyan/80">
              {activity.label} · {seats} host seats · you joined as audience
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2.5">
            {Array.from({ length: seats }).map((_, i) => (
              <div
                key={i}
                className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-cyan/35 bg-ink-2 shadow-[0_0_14px_rgba(0,240,255,0.2)]"
              >
                <Image
                  src={i === 0 ? hostImage : SEAT_AVATARS[i % SEAT_AVATARS.length]}
                  alt=""
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="text-[10px] font-bold text-white">
                    {i === 0 ? hostName.split(" ")[0] : `Host ${i + 1}`}
                  </p>
                </div>
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-coral px-1.5 py-0.5 text-[8px] font-bold text-white">
                    LEAD
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-auto flex gap-2 pt-8">
            <button
              type="button"
              onClick={() => setGiftOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-gold/40 bg-gold/15 py-3.5 text-sm font-bold text-gold"
            >
              <Gift className="h-4 w-4" /> Send gift
            </button>
            <Link
              href={`/call/${id}?live=1`}
              onClick={() => pushToast("Requesting private 1v1 from party…")}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-coral py-3.5 text-sm font-bold text-white shadow-[0_0_24px_rgba(255,42,122,0.45)]"
            >
              <Phone className="h-4 w-4" /> Private 1v1
            </Link>
          </div>
        </div>

        <GiftSheet open={giftOpen} onClose={() => setGiftOpen(false)} />
      </main>
    </LoungeShell>
  );
}
