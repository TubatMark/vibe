import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Allow this computer's actual interface addresses, without opening dev assets
// to arbitrary origins. Refreshes naturally when the local server restarts.
const localAddresses = Object.values(networkInterfaces()).flatMap(addresses =>
  (addresses ?? []).filter(address => address.family === "IPv4").map(address => address.address),
);

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
/** Convex talks over a WebSocket to the same origin it is served from. */
const convexOrigins = convexUrl ? [convexUrl, convexUrl.replace(/^http/, "ws")] : [];
const development = process.env.NODE_ENV !== "production";

/**
 * A content policy for a page that embeds two music providers.
 *
 * `script-src` has to keep `'unsafe-inline'`: the app is prerendered and
 * partially prefetched, and Next's own bootstrap scripts are inline, so the
 * alternative is a per-request nonce that would make every route dynamic. A
 * hash or nonce would also silently void `'unsafe-inline'` for the rest. So
 * this is not an anti-XSS wall; what it does buy is a closed list of origins a
 * page may load code from and — the part that matters while a six-month Spotify
 * refresh token lives in localStorage — a closed list of places it may send
 * anything to.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  [
    "script-src 'self' 'unsafe-inline'",
    "https://www.youtube.com https://s.ytimg.com https://sdk.scdn.co",
    // Turbopack's development client evaluates the modules it streams in.
    development ? "'unsafe-eval'" : "",
  ].filter(Boolean).join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.ytimg.com https://img.youtube.com https://*.scdn.co https://*.spotifycdn.com",
  "font-src 'self' data:",
  ["connect-src 'self'", ...convexOrigins,
    "https://accounts.spotify.com https://api.spotify.com https://spclient.wg.spotify.com",
    "https://open.spotify.com https://www.youtube.com",
    development ? "ws: wss:" : "",
  ].filter(Boolean).join(" "),
  "media-src 'self' blob: https://*.scdn.co",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://sdk.scdn.co",
  "worker-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Companion to frame-ancestors for anything that still reads this one.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /* config options here */
  // Lets a second window open the dev server on another host (127.0.0.1, a phone
  // on the LAN) so sync can be tried with two independent listeners.
  allowedDevOrigins: [...new Set(["127.0.0.1", ...localAddresses])],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Compile CSS in worker threads so builds also work in restricted runners
    // where loader subprocesses cannot open their IPC sockets.
    turbopackPluginRuntimeStrategy: "workerThreads",
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
