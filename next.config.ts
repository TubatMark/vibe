import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Lets a second window open the dev server on another host (127.0.0.1, a phone
  // on the LAN) so sync can be tried with two independent listeners.
  allowedDevOrigins: ["127.0.0.1"],
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
