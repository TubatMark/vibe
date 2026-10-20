import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function makeSlug(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++)
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export async function requireHost(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  userId: string,
) {
  const room = await ctx.db.get(roomId);
  if (!room) throw new Error("Room not found");
  if (room.hostId !== userId) throw new Error("Only the host can do that");
  return room;
}

/** Pop the next queued track into `current` and start playing it. */
export async function advance(ctx: MutationCtx, room: Doc<"rooms">) {
  const next = await ctx.db
    .query("queue")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .order("asc")
    .first();
  const now = Date.now();
  if (!next) {
    await ctx.db.patch(room._id, {
      current: undefined,
      isPlaying: false,
      startedAt: now,
      pausedAt: 0,
      lastActiveAt: now,
    });
    return;
  }
  await ctx.db.delete(next._id);
  await ctx.db.patch(room._id, {
    current: {
      videoId: next.videoId,
      title: next.title,
      author: next.author,
      thumbnail: next.thumbnail,
    },
    isPlaying: true,
    startedAt: now,
    pausedAt: 0,
    lastActiveAt: now,
  });
}

export const create = mutation({
  args: { name: v.string(), hostId: v.string() },
  handler: async (ctx, { name, hostId }) => {
    let slug = makeSlug();
    while (
      await ctx.db
        .query("rooms")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique()
    ) {
      slug = makeSlug();
    }
    const now = Date.now();
    await ctx.db.insert("rooms", {
      slug,
      name: name.trim() || "untitled room",
      hostId,
      mode: "approval",
      isPlaying: false,
      startedAt: now,
      pausedAt: 0,
      lastActiveAt: now,
    });
    return slug;
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!room) return null;
    // Expose server time so clients can compute clock offset for sync.
    return { ...room, serverNow: Date.now() };
  },
});

export const play = mutation({
  args: { roomId: v.id("rooms"), userId: v.string() },
  handler: async (ctx, { roomId, userId }) => {
    const room = await requireHost(ctx, roomId, userId);
    if (!room.current) {
      await advance(ctx, room);
      return;
    }
    if (room.isPlaying) return;
    const now = Date.now();
    await ctx.db.patch(roomId, {
      isPlaying: true,
      startedAt: now - room.pausedAt,
      lastActiveAt: now,
    });
  },
});

export const pause = mutation({
  args: { roomId: v.id("rooms"), userId: v.string() },
  handler: async (ctx, { roomId, userId }) => {
    const room = await requireHost(ctx, roomId, userId);
    if (!room.isPlaying) return;
    const now = Date.now();
    await ctx.db.patch(roomId, {
      isPlaying: false,
      pausedAt: now - room.startedAt,
      lastActiveAt: now,
    });
  },
});

export const seek = mutation({
  args: { roomId: v.id("rooms"), userId: v.string(), positionMs: v.number() },
  handler: async (ctx, { roomId, userId, positionMs }) => {
    const room = await requireHost(ctx, roomId, userId);
    const now = Date.now();
    await ctx.db.patch(roomId, {
      startedAt: now - positionMs,
      pausedAt: room.isPlaying ? 0 : positionMs,
      lastActiveAt: now,
    });
  },
});

export const skip = mutation({
  args: { roomId: v.id("rooms"), userId: v.string() },
  handler: async (ctx, { roomId, userId }) => {
    const room = await requireHost(ctx, roomId, userId);
    await advance(ctx, room);
  },
});

/** Called by any client when the current track ends. Idempotent-ish via videoId check. */
export const ended = mutation({
  args: { roomId: v.id("rooms"), videoId: v.string() },
  handler: async (ctx, { roomId, videoId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.current?.videoId !== videoId) return;
    await advance(ctx, room);
  },
});

export const setMode = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
    mode: v.union(v.literal("open"), v.literal("approval")),
  },
  handler: async (ctx, { roomId, userId, mode }) => {
    await requireHost(ctx, roomId, userId);
    await ctx.db.patch(roomId, { mode });
  },
});
