import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Small self-contained server for the container image (Phase 9).
  output: "standalone",
  // Keep the OpenTelemetry SDK and Elasticsearch client out of the bundle (Phase 5).
  serverExternalPackages: [
    "@opentelemetry/sdk-node",
    "@opentelemetry/auto-instrumentations-node",
    "@elastic/elasticsearch",
  ],
  cacheComponents: true,
  partialPrefetching: true,
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
