import { v } from "convex/values";
import { action } from "./_generated/server";
import { extractYouTubeId } from "./trackId";
import { cleanText } from "./validate";

/** Resolve a YouTube URL or ID to track metadata via oEmbed (no API key needed). */
export const resolve = action({
  args: { input: v.string() },
  handler: async (_ctx, { input }) => {
    const videoId = extractYouTubeId(input);
    if (!videoId) throw new Error("That doesn't look like a YouTube link or ID");
    // Encoded, so the id can never add parameters of its own to the request.
    const target = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
    const res = await fetch(`https://www.youtube.com/oembed?url=${target}&format=json`);
    if (!res.ok) throw new Error("Video not found or not embeddable");
    const data = (await res.json()) as { title: string; author_name: string };
    return {
      videoId,
      title: cleanText(data.title ?? "", 200, "untitled track"),
      author: cleanText(data.author_name ?? "", 120, "unknown"),
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    };
  },
});
