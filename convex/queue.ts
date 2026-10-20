import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { trackFields } from "./schema";
import { advance, requireHost } from "./rooms";

async function nextPosition(ctx: MutationCtx, roomId: Id<"rooms">) {
  const last = await ctx.db
    .query("queue")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .order("desc")
    .first();
  return (last?.position ?? 0) + 1;
}

export async function enqueue(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  track: { videoId: string; title: string; author: string; thumbnail: string },
  by: { id: string; name: string },
) {
  await ctx.db.insert("queue", {
    roomId,
    ...track,
    addedBy: by.id,
    addedByName: by.name,
    position: await nextPosition(ctx, roomId),
  });
  // Auto-start if nothing is playing.
  const room = await ctx.db.get(roomId);
  if (room && !room.current) await advance(ctx, room);
}

export const list = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) =>
    ctx.db
      .query("queue")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .order("asc")
      .collect(),
});

/**
 * Add a track. Host always goes straight to the queue.
 * Others go to the queue in "open" mode, or to requests in "approval" mode.
 */
export const add = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
    userName: v.string(),
    track: v.object(trackFields),
  },
  handler: async (ctx, { roomId, userId, userName, track }) => {
    const room = await ctx.db.get(roomId);
    if (!room) throw new Error("Room not found");
    const by = { id: userId, name: userName };
    if (room.hostId === userId || room.mode === "open") {
      await enqueue(ctx, roomId, track, by);
      return "queued" as const;
    }
    await ctx.db.insert("requests", {
      roomId,
      ...track,
      requestedBy: userId,
      requestedByName: userName,
      status: "pending",
    });
    return "requested" as const;
  },
});

export const remove = mutation({
  args: { roomId: v.id("rooms"), userId: v.string(), itemId: v.id("queue") },
  handler: async (ctx, { roomId, userId, itemId }) => {
    const item = await ctx.db.get(itemId);
    if (!item || item.roomId !== roomId) return;
    const room = await ctx.db.get(roomId);
    if (!room) return;
    if (room.hostId !== userId && item.addedBy !== userId)
      throw new Error("Not allowed");
    await ctx.db.delete(itemId);
  },
});

export const move = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
    itemId: v.id("queue"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, { roomId, userId, itemId, direction }) => {
    await requireHost(ctx, roomId, userId);
    const items = await ctx.db
      .query("queue")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .order("asc")
      .collect();
    const i = items.findIndex((x) => x._id === itemId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= items.length) return;
    await ctx.db.patch(items[i]._id, { position: items[j].position });
    await ctx.db.patch(items[j]._id, { position: items[i].position });
  },
});
