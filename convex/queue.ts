import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { trackFields, type Track } from "./schema";
import { advance, holdsHostToken, requireHost, touchRoom } from "./rooms";
import { limitAddTrack } from "./limits";
import { cleanDisplayName, cleanTrack } from "./validate";

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
  track: Track,
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
 * Add a track. The host always goes straight to the queue.
 * Others go to the queue in "open" mode, or to requests in "approval" mode.
 * The track came from a browser, so it is re-checked here rather than trusted.
 */
export const add = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
    userName: v.string(),
    track: v.object(trackFields),
    hostToken: v.optional(v.string()),
  },
  handler: async (ctx, { roomId, userId, userName, track, hostToken }) => {
    const room = await ctx.db.get(roomId);
    if (!room) throw new Error("Room not found");
    await limitAddTrack(ctx, roomId);
    await touchRoom(ctx, room);
    const clean = cleanTrack(track);
    const by = { id: userId, name: cleanDisplayName(userName) };
    if (holdsHostToken(room, hostToken) || room.mode === "open") {
      await enqueue(ctx, roomId, clean, by);
      return "queued" as const;
    }
    await ctx.db.insert("requests", {
      roomId,
      ...clean,
      requestedBy: userId,
      requestedByName: by.name,
      status: "pending",
    });
    return "requested" as const;
  },
});

/**
 * The host can remove anything; anyone else can remove what they added.
 * `addedBy` is a published id rather than a secret, so the second case trusts
 * the caller's word about who they are: enough to keep the UI honest, not a
 * defence against another listener in the same room.
 */
export const remove = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
    itemId: v.id("queue"),
    hostToken: v.optional(v.string()),
  },
  handler: async (ctx, { roomId, userId, itemId, hostToken }) => {
    const item = await ctx.db.get(itemId);
    if (!item || item.roomId !== roomId) return;
    const room = await ctx.db.get(roomId);
    if (!room) return;
    if (!holdsHostToken(room, hostToken) && item.addedBy !== userId)
      throw new Error("Not allowed");
    await ctx.db.delete(itemId);
  },
});

export const move = mutation({
  args: {
    roomId: v.id("rooms"),
    hostToken: v.string(),
    itemId: v.id("queue"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, { roomId, hostToken, itemId, direction }) => {
    await requireHost(ctx, roomId, hostToken);
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
