import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { cleanRoomName } from "./validate";
import { limitCreateRoom } from "./limits";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
/**
 * The room code is the only thing between a stranger and a room, so it has to
 * be long enough that enumerating codes isn't worth anyone's time: ten
 * characters of this alphabet is a little under 50 bits. Convex gives queries
 * and mutations a seeded strong PRNG at `Math.random()` and refuses
 * cryptographic randomness outright, so this is the strongest source available
 * inside a mutation.
 */
const CODE_LENGTH = 10;
/** A host token is made in the browser, where real randomness exists. */
const MIN_HOST_TOKEN = 32;
/** No real track ends within a second of starting; see `ended`. */
const MIN_PLAY_MS = 5_000;
/**
 * How stale `lastActiveAt` may get before a sign of life rewrites it. Idle
 * rooms are pruned, so it has to be refreshed — but every listener is a source
 * of activity, and rewriting the room row on each one would be the busiest
 * write in the app for no benefit. Minutes of slack cost nothing against a
 * month-long idle window.
 */
const ACTIVITY_INTERVAL_MS = 5 * 60_000;

function makeSlug(len = CODE_LENGTH) {
  let s = "";
  for (let i = 0; i < len; i++)
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

/** True when this caller holds the room's host token. */
export function holdsHostToken(room: Doc<"rooms">, hostToken?: string) {
  return !!room.hostToken && !!hostToken && room.hostToken === hostToken;
}

export async function requireHost(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  hostToken: string,
) {
  const room = await ctx.db.get(roomId);
  if (!room) throw new Error("Room not found");
  if (!holdsHostToken(room, hostToken)) throw new Error("Only the host can do that");
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
      source: next.source,
    },
    isPlaying: true,
    startedAt: now,
    pausedAt: 0,
    lastActiveAt: now,
  });
}

/** Any sign of life in a room, written at most once per interval. */
export async function touchRoom(ctx: MutationCtx, room: Doc<"rooms">) {
  const now = Date.now();
  if (now - room.lastActiveAt < ACTIVITY_INTERVAL_MS) return;
  await ctx.db.patch(room._id, { lastActiveAt: now });
}

export const create = mutation({
  args: { name: v.string(), hostId: v.string(), hostToken: v.string() },
  handler: async (ctx, { name, hostId, hostToken }) => {
    if (hostToken.length < MIN_HOST_TOKEN) throw new Error("Host token is too short");
    await limitCreateRoom(ctx, hostId);
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
      name: cleanRoomName(name),
      hostId,
      hostToken,
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
    /**
     * Named one by one on purpose. The host token is this room's only
     * credential and must never leave the server, and spreading the row would
     * publish whatever the schema gains next without anyone noticing.
     */
    return {
      _id: room._id,
      _creationTime: room._creationTime,
      slug: room.slug,
      name: room.name,
      hostId: room.hostId,
      mode: room.mode,
      current: room.current,
      isPlaying: room.isPlaying,
      startedAt: room.startedAt,
      pausedAt: room.pausedAt,
      lastActiveAt: room.lastActiveAt,
      // Expose server time so clients can compute clock offset for sync.
      serverNow: Date.now(),
    };
  },
});

export const play = mutation({
  args: { roomId: v.id("rooms"), hostToken: v.string() },
  handler: async (ctx, { roomId, hostToken }) => {
    const room = await requireHost(ctx, roomId, hostToken);
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
  args: { roomId: v.id("rooms"), hostToken: v.string() },
  handler: async (ctx, { roomId, hostToken }) => {
    const room = await requireHost(ctx, roomId, hostToken);
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
  args: { roomId: v.id("rooms"), hostToken: v.string(), positionMs: v.number() },
  handler: async (ctx, { roomId, hostToken, positionMs }) => {
    const room = await requireHost(ctx, roomId, hostToken);
    const position = Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0;
    const now = Date.now();
    await ctx.db.patch(roomId, {
      startedAt: now - position,
      pausedAt: room.isPlaying ? 0 : position,
      lastActiveAt: now,
    });
  },
});

export const skip = mutation({
  args: { roomId: v.id("rooms"), hostToken: v.string() },
  handler: async (ctx, { roomId, hostToken }) => {
    const room = await requireHost(ctx, roomId, hostToken);
    await advance(ctx, room);
  },
});

/**
 * Reported by whichever browser notices the current track finish, so it cannot
 * require the host token. The guards below throw out the reports that can't be
 * real — a paused room has nothing to finish, and nothing finishes in the first
 * few seconds — which stops a listener from using this to skip the room's music.
 */
export const ended = mutation({
  args: { roomId: v.id("rooms"), videoId: v.string() },
  handler: async (ctx, { roomId, videoId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.current?.videoId !== videoId) return;
    if (!room.isPlaying) return;
    if (Date.now() - room.startedAt < MIN_PLAY_MS) return;
    await advance(ctx, room);
  },
});

export const setMode = mutation({
  args: {
    roomId: v.id("rooms"),
    hostToken: v.string(),
    mode: v.union(v.literal("open"), v.literal("approval")),
  },
  handler: async (ctx, { roomId, hostToken, mode }) => {
    await requireHost(ctx, roomId, hostToken);
    await ctx.db.patch(roomId, { mode });
  },
});
