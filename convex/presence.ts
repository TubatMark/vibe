import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const TTL_MS = 30_000;

export const heartbeat = mutation({
  args: { roomId: v.id("rooms"), userId: v.string(), name: v.string() },
  handler: async (ctx, { roomId, userId, name }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { lastSeen: now, name });
    } else {
      await ctx.db.insert("presence", { roomId, userId, name, lastSeen: now });
    }
    // Opportunistic cleanup of stale rows.
    const stale = await ctx.db
      .query("presence")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .filter((q) => q.lt(q.field("lastSeen"), now - TTL_MS * 2))
      .collect();
    for (const s of stale) await ctx.db.delete(s._id);
  },
});

export const leave = mutation({
  args: { roomId: v.id("rooms"), userId: v.string() },
  handler: async (ctx, { roomId, userId }) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const list = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const cutoff = Date.now() - TTL_MS;
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    return rows.filter((r) => r.lastSeen > cutoff);
  },
});
