import { v } from "convex/values";
import { action } from "./_generated/server";

/** Resolve a YouTube URL or ID to track metadata via oEmbed (no API key needed). */
export const resolve = action({
  args: { input: v.string() },
  handler: async (_ctx, { input }) => {
    const videoId = extractVideoId(input);
    if (!videoId) throw new Error("That doesn't look like a YouTube link or ID");
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    );
    if (!res.ok) throw new Error("Video not found or not embeddable");
    const data = (await res.json()) as { title: string; author_name: string };
    return {
      videoId,
      title: data.title,
      author: data.author_name,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    };
  },
});

export function extractVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname === "youtu.be") return u.pathname.slice(1, 12) || null;
    if (u.hostname.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}
