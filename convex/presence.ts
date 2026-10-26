import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { cleanDisplayName } from "./validate";
import { touchRoom } from "./rooms";

/** How long a row counts as someone being here. Clients beat every 10s. */
const TTL_MS = 30_000;
/**
 * The floor between two writes of the same row. Beats arrive on their own
 * schedule and well inside this, so an honest listener is unaffected; what it
 * removes is the ability to turn a heartbeat into a write loop.
 */
const MIN_WRITE_MS = 5_000;

export const heartbeat = mutation({
  args: { roomId: v.id("rooms"), userId: v.string(), name: v.string() },
  handler: async (ctx, { roomId, userId, name }) => {
    const now = Date.now();
    const display = cleanDisplayName(name);
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
      .unique();

    if (existing) {
      if (now - existing.lastSeen < MIN_WRITE_MS && existing.name === display) return;
      await ctx.db.patch(existing._id, { lastSeen: now, name: display });
    } else {
      await ctx.db.insert("presence", { roomId, userId, name: display, lastSeen: now });
    }

    /*
     * Stale rows used to be swept here, which made every beat read and write
     * the whole room's presence: with N listeners each beating, that is N²
     * work per interval, and the rows it deleted were already invisible to
     * `list` below. The sweep now runs on a cron over `by_last_seen`, across
     * every room at once, and a beat costs one lookup and one write again.
     */

    // Somebody being in the room is the sign of life a quiet room still has.
    const room = await ctx.db.get(roomId);
    if (room) await touchRoom(ctx, room);
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
