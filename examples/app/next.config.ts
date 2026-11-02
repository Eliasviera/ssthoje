import type { NextConfig } from "next";

// Cada verificação pode usar uma pasta nova, sem tocar na saída do servidor local.
const verificationId = process.env.SST_BUILD_VERIFY_ID;
if (verificationId && !/^[a-z0-9-]{1,40}$/.test(verificationId)) {
  throw new Error("SST_BUILD_VERIFY_ID deve conter até 40 letras minúsculas, números ou hífens.");
}
const nextConfig: NextConfig = {
  distDir: process.env.SST_ISOLATED_BUILD === "1" ? `.next-verify-${verificationId || "m20"}` : ".next",
  /* config options here */
  devIndicators: false,
  serverExternalPackages: ["pdf-parse"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
