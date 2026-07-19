"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Video, Radio } from "lucide-react";
import type { Creator } from "@/lib/data";

export function CreatorCard({
  creator,
  index = 0,
}: {
  creator: Creator;
  index?: number;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
      className="relative overflow-hidden rounded-[1.35rem]"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${creator.gradient}`} />
      <Image
        src={creator.image}
        alt={creator.name}
        width={400}
        height={520}
        className="aspect-[3/4] h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

      <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
        {creator.live ? (
          <span className="live-pulse flex items-center gap-1 rounded-full bg-coral px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            <Radio className="h-3 w-3" /> Live
          </span>
        ) : creator.online ? (
          <span className="rounded-full bg-teal/90 px-2 py-0.5 text-[10px] font-bold text-ink">
            Online
          </span>
        ) : (
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-sand/80">
            Away
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="mb-1 flex items-center gap-1.5">
          <h3 className="font-display text-lg font-bold text-white">
            {creator.name}, {creator.age}
          </h3>
          <span className="text-sm">{creator.flag}</span>
        </div>
        <p className="mb-2 line-clamp-1 text-xs text-white/75">{creator.bio}</p>
        <div className="flex gap-2">
          {creator.live ? (
            <Link
              href={`/live/${creator.id}`}
              className="flex flex-1 items-center justify-center gap-1 rounded-full bg-coral py-2 text-xs font-bold text-white"
            >
              <Radio className="h-3.5 w-3.5" /> Join live
            </Link>
          ) : (
            <Link
              href={`/call/${creator.id}`}
              className="flex flex-1 items-center justify-center gap-1 rounded-full bg-sand py-2 text-xs font-bold text-ink"
            >
              <Video className="h-3.5 w-3.5" /> Call · {creator.callRate}/min
            </Link>
          )}
        </div>
      </div>
    </motion.article>
  );
}
