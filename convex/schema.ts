import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const trackFields = {
  /** Provider id: a YouTube video id, or a Spotify track id. */
  videoId: v.string(),
  title: v.string(),
  author: v.string(),
  thumbnail: v.string(),
  /** Absent on rows written before Spotify support; treat those as YouTube. */
  source: v.optional(v.union(v.literal("youtube"), v.literal("spotify"))),
};

export type Track = {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  source?: "youtube" | "spotify";
};

export default defineSchema({
  rooms: defineTable({
    slug: v.string(),
    name: v.string(),
    /** Public, pseudonymous: shown as the Host badge. Not a credential. */
    hostId: v.string(),
    /**
     * The host's capability for this room. Created in the host's browser,
     * stored here, and never returned by a query — a browser can call any
     * mutation directly, so host rights cannot ride on a published id.
     * Absent on rooms created before host tokens: those have no host.
     */
    hostToken: v.optional(v.string()),
    // "open": anyone adds straight to the queue. "approval": requests need host approval.
    mode: v.union(v.literal("open"), v.literal("approval")),
    current: v.optional(v.object(trackFields)),
    isPlaying: v.boolean(),
    // Server timestamp (ms) at which playback of `current` would have been at position 0.
    // elapsed = now - startedAt while playing. When paused, `pausedAt` holds the offset.
    startedAt: v.number(),
    pausedAt: v.number(),
    lastActiveAt: v.number(),
  })
    .index("by_slug", ["slug"])
    // Scanned by the retention cron looking for rooms nobody came back to.
    .index("by_last_active", ["lastActiveAt"]),

  queue: defineTable({
    roomId: v.id("rooms"),
    ...trackFields,
    addedBy: v.string(),
    addedByName: v.string(),
    position: v.number(),
  }).index("by_room", ["roomId", "position"]),

  requests: defineTable({
    roomId: v.id("rooms"),
    ...trackFields,
    requestedBy: v.string(),
    requestedByName: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
  }).index("by_room_status", ["roomId", "status"]),

  presence: defineTable({
    roomId: v.id("rooms"),
    userId: v.string(),
    name: v.string(),
    lastSeen: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_user", ["roomId", "userId"])
    // Lets the cron sweep stale rows across all rooms at once.
    .index("by_last_seen", ["lastSeen"]),

  messages: defineTable({
    roomId: v.id("rooms"),
    userId: v.string(),
    name: v.string(),
    text: v.string(),
  }).index("by_room", ["roomId"]),
});
