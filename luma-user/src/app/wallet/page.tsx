"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Coins, Play, Store, Zap } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { purchaseCoins } from "@/lib/payments/iap";
import type { IapProduct } from "@/lib/payments/iapCatalog";
import { fetchCoinCatalog } from "@/lib/walletApi";
import { useApp } from "@/lib/store";

export default function WalletPage() {
  const { coins, userId, ready, pushToast, syncWallet, isPremium } = useApp();
  const [products, setProducts] = useState<IapProduct[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    void fetchCoinCatalog().then((list) => {
      setProducts(list as IapProduct[]);
      const popular =
        list.find((p) => p.popular)?.productId || list[0]?.productId || "";
      setSelected(popular);
    });
  }, []);

  const pack = products.find((p) => p.productId === selected) || products[0];

  const buyWithStore = async () => {
    if (!pack || !userId) {
      pushToast("Wallet not ready");
      return;
    }
    setBuying(true);
    try {
      const result = await purchaseCoins({
        userId,
        productId: pack.productId,
      });
      if ("redirected" in result) {
        pushToast("Opening store checkout…");
        return;
      }
      await syncWallet();
      pushToast(`+${result.credited} coins credited`);
    } catch (e: unknown) {
      pushToast(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setBuying(false);
    }
  };

  return (
    <main>
      <TopBar
        title="Coin wallet"
        subtitle="Live balance · Google Play / App Store IAP"
      />

      <section className="px-4 pb-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-cyan/25 bg-ink-2 p-5"
        >
          <div className="relative">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan">
              <Coins className="h-3.5 w-3.5" /> Live balance
              {!ready ? " · syncing…" : ""}
            </p>
            <p className="mt-1 font-display text-4xl font-extrabold tabular-nums text-sand">
              {coins.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-cyan/70">
              User {userId ? `${userId.slice(0, 12)}…` : "—"} ·{" "}
              {isPremium ? "VIP" : "Standard"}
            </p>
            <button
              type="button"
              onClick={() => void syncWallet()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-cyan/30 px-3 py-1.5 text-xs font-bold text-cyan"
            >
              <Zap className="h-3.5 w-3.5" /> Refresh from API
            </button>
          </div>
        </motion.div>
      </section>

      <section className="space-y-2 px-4 pb-4">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted">
          IAP products
        </h2>
        {products.map((p) => {
          const total = p.coins + p.bonusCoins;
          return (
            <button
              key={p.productId}
              type="button"
              onClick={() => setSelected(p.productId)}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${
                selected === p.productId
                  ? "border-coral bg-coral/10"
                  : "border-line bg-ink-2"
              }`}
            >
              <div>
                <p className="font-display font-bold">{p.title}</p>
                <p className="text-[11px] text-muted">
                  {total.toLocaleString()} coins · {p.productId}
                </p>
              </div>
              <span className="font-display text-lg font-extrabold text-cyan">
                {p.priceLabel}
              </span>
            </button>
          );
        })}
      </section>

      <section className="px-4 pb-10">
        <button
          type="button"
          disabled={!pack || buying}
          onClick={() => void buyWithStore()}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-coral py-4 text-sm font-bold text-white shadow-[0_0_28px_rgba(255,42,122,0.4)] disabled:opacity-50"
        >
          <Store className="h-4 w-4" />
          {buying ? "Processing…" : "Buy with Play / App Store"}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted">
          <Play className="h-3 w-3" />
          Server verifies receipt before crediting coins
        </p>
      </section>
    </main>
  );
}
