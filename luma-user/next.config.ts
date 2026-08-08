import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // This nested app intentionally shares the root workspace dependency
    // installation. Turbopack must therefore watch their common parent.
    root: path.resolve(process.cwd(), "..", ".."),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "i.pravatar.cc", pathname: "/**" },
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com", pathname: "/**" },
    ],
    // Host avatars from many CDNs — allow any https host in production lounge
    dangerouslyAllowSVG: false,
  },
};

export default nextConfig;
