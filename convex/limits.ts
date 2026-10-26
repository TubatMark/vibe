import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";

/**
 * Rate limits for the mutations anyone can call.
 *
 * What a key can be is decided by what the room actually knows. A guest id is
 * a random string this browser made up and can remake for free, so a per-guest
 * limit is a courtesy that keeps honest clients from misbehaving — it stops
 * nobody who is trying. The limits that bind are the ones keyed by the room,
 * which is a real row nobody can mint, and the one global limit on making
 * rooms at all, which is what bounds how fast this database can grow.
 *
 * The numbers are meant to sit far above a real room: ten people adding songs
 * and talking over each other should never meet one of these.
 */
export const limiter = new RateLimiter(components.rateLimiter, {
  /** The bound that matters: how fast rooms can come into existence at all. */
  createRoom: { kind: "fixed window", rate: 200, period: HOUR },
  createRoomPerGuest: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },
  /** Per room: a queue is shared, so flooding one is flooding everyone in it. */
  addTrack: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },
  sendMessage: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 60 },
  sendMessagePerGuest: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 10 },
});

function wait(retryAfter: number) {
  const seconds = Math.max(1, Math.ceil(retryAfter / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export async function limitCreateRoom(ctx: MutationCtx, hostId: string) {
  const guest = await limiter.limit(ctx, "createRoomPerGuest", { key: hostId });
  if (!guest.ok)
    throw new Error(`That's a lot of new rooms. Try again in ${wait(guest.retryAfter)}.`);
  const overall = await limiter.limit(ctx, "createRoom");
  if (!overall.ok)
    throw new Error(`vibe is making rooms as fast as it can. Try again in ${wait(overall.retryAfter)}.`);
}

export async function limitAddTrack(ctx: MutationCtx, roomId: string) {
  const room = await limiter.limit(ctx, "addTrack", { key: roomId });
  if (!room.ok)
    throw new Error(`This room is taking tracks faster than it can play them. Try again in ${wait(room.retryAfter)}.`);
}

export async function limitSendMessage(ctx: MutationCtx, roomId: string, userId: string) {
  const guest = await limiter.limit(ctx, "sendMessagePerGuest", { key: userId });
  if (!guest.ok)
    throw new Error(`Slow down a moment — try again in ${wait(guest.retryAfter)}.`);
  const room = await limiter.limit(ctx, "sendMessage", { key: roomId });
  if (!room.ok)
    throw new Error(`The room is talking faster than it can listen. Try again in ${wait(room.retryAfter)}.`);
}
