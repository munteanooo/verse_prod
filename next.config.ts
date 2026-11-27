import type { NextConfig } from "next";
import { parseEnvironment } from "./src/config/environment";

const { siteUrl } = parseEnvironment({
  VERSE_SITE_URL: process.env.VERSE_SITE_URL,
});

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  logging: { incomingRequests: false },
  serverExternalPackages: ["sharp"],
  outputFileTracingIncludes: {
    "/api/v1/admin/*": [
      "./src/infrastructure/documents/worker.mjs",
      "./src/modules/documents/*.mjs",
      "./node_modules/pdf-lib/**/*",
      "./node_modules/.pnpm/{pdf-lib@*,@pdf-lib+*,pako@*,tslib@*}/node_modules/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          ...(siteUrl?.startsWith("https:")
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
