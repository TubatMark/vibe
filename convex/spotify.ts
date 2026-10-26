import { v } from "convex/values";
import { action } from "./_generated/server";
import { extractSpotifyTrackId, isSpotifyId } from "./trackId";
import { cleanText } from "./validate";

/**
 * Track lookup for Spotify links.
 *
 * Runs server side with the client-credentials flow so anyone can add a Spotify
 * track — the person pasting the link doesn't need a connected account, and the
 * client secret never reaches the browser. Playback is a separate matter: that
 * happens in each listener's own browser with their own Premium account
 * (src/components/spotify-player.tsx).
 */

type AppToken = { value: string; expiresAt: number };
let cached: AppToken | null = null;

async function appToken() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "Spotify isn't configured on the server. Set SPOTIFY_CLIENT_ID and " +
        "SPOTIFY_CLIENT_SECRET with `npx convex env set`.",
    );
  }
  // Tokens last an hour; reuse one while the action container is warm.
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) {
    throw new Error(
      `Spotify refused the app credentials (${res.status}). Check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.`,
    );
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cached.value;
}

export const resolve = action({
  args: { input: v.string() },
  handler: async (_ctx, { input }) => {
    const trackId = extractTrackId(input);
    if (!trackId) throw new Error("That doesn't look like a Spotify track link");

    const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${await appToken()}` },
    });
    if (res.status === 404) throw new Error("Spotify doesn't have that track");
    if (!res.ok) throw new Error(`Spotify said ${res.status}`);

    const data = (await res.json()) as {
      name: string;
      artists: { name: string }[];
      album: { images: { url: string; width: number }[] };
      is_playable?: boolean;
    };
    // Images come widest first; the last one is the ~64px thumbnail.
    const images = data.album.images ?? [];
    return {
      videoId: trackId,
      title: cleanText(data.name ?? "", 200, "untitled track"),
      author: cleanText((data.artists ?? []).map((a) => a.name).join(", "), 120, "unknown"),
      thumbnail: images[images.length - 1]?.url ?? "",
      source: "spotify" as const,
    };
  },
});

/** Accepts open.spotify.com links (with or without a locale), URIs, and bare ids. */
export function extractTrackId(input: string): string | null {
  const s = input.trim();
  // A bare id is unambiguous here because the caller already chose Spotify.
  return isSpotifyId(s) ? s : extractSpotifyTrackId(s);
}
