import type { Metadata } from "next";
import { Syne, Manrope } from "next/font/google";
import { AppProvider } from "@/lib/store";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell } from "@/components/auth/AppShell";
import { GiftAnimationQueueProvider } from "@/components/gifts/GiftAnimationQueue";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Luma — Live, 1v1 & Coins",
  description:
    "User-side coin app for live streams, private 1v1 video calls, chat, VIP premium, and Play Store recharge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${manrope.variable} h-full`}>
      <body className="app-atmosphere app-grain min-h-full antialiased">
        <AppProvider>
          <GiftAnimationQueueProvider>
            <AuthGuard>
              <AppShell>{children}</AppShell>
            </AuthGuard>
          </GiftAnimationQueueProvider>
        </AppProvider>
      </body>
    </html>
  );
}
