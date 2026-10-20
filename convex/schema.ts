import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const trackFields = {
  videoId: v.string(),
  title: v.string(),
  author: v.string(),
  thumbnail: v.string(),
};

export default defineSchema({
  rooms: defineTable({
    slug: v.string(),
    name: v.string(),
    hostId: v.string(),
    // "open": anyone adds straight to the queue. "approval": requests need host approval.
    mode: v.union(v.literal("open"), v.literal("approval")),
    current: v.optional(v.object(trackFields)),
    isPlaying: v.boolean(),
    // Server timestamp (ms) at which playback of `current` would have been at position 0.
    // elapsed = now - startedAt while playing. When paused, `pausedAt` holds the offset.
    startedAt: v.number(),
    pausedAt: v.number(),
    lastActiveAt: v.number(),
  }).index("by_slug", ["slug"]),

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
    .index("by_room_user", ["roomId", "userId"]),

  messages: defineTable({
    roomId: v.id("rooms"),
    userId: v.string(),
    name: v.string(),
    text: v.string(),
  }).index("by_room", ["roomId"]),
});
