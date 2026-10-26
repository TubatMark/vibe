import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * How long a room survives with nobody in it.
 *
 * A room is an evening, not an account: once the last listener has gone and
 * stayed gone, keeping the queue and the conversation serves nobody. A month
 * is long enough that a room you come back to after a holiday is still there,
 * and short enough that abandoned rooms do not accumulate forever. Anything
 * that counts as a sign of life — playback, a track, a message, somebody
 * simply being present — pushes `lastActiveAt` forward (see `touchRoom`).
 */
const IDLE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Presence rows stop counting after `TTL_MS` in `convex/presence.ts`, so these
 * are already invisible to everyone; this is only reclaiming the storage.
 */
const PRESENCE_STALE_MS = 5 * 60_000;

/** Budgets, so one run can never grow into a transaction too big to commit. */
const ROOMS_PER_RUN = 10;
const ROWS_PER_TABLE = 200;
const PRESENCE_PER_RUN = 500;

export const pruneStalePresence = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - PRESENCE_STALE_MS;
    const stale = await ctx.db
      .query("presence")
      .withIndex("by_last_seen", (q) => q.lt("lastSeen", cutoff))
      .take(PRESENCE_PER_RUN);
    for (const row of stale) await ctx.db.delete(row._id);
    return { deleted: stale.length };
  },
});

export const pruneIdleRooms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - IDLE_MS;
    const idle = await ctx.db
      .query("rooms")
      .withIndex("by_last_active", (q) => q.lt("lastActiveAt", cutoff))
      .take(ROOMS_PER_RUN);
    let removed = 0;
    for (const room of idle) {
      // A room with more rows than one run's budget keeps its row for now; it
      // is still idle, so the next run picks up where this one stopped.
      if (await clearRoom(ctx, room._id)) {
        await ctx.db.delete(room._id);
        removed += 1;
      }
    }
    return { examined: idle.length, removed };
  },
});

/** Deletes a room's rows within the budget. True when nothing is left. */
async function clearRoom(ctx: MutationCtx, roomId: Id<"rooms">) {
  let complete = true;

  // One past the budget, so a full page tells us there is more to come.
  const queued = await ctx.db
    .query("queue")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(ROWS_PER_TABLE + 1);
  if (queued.length > ROWS_PER_TABLE) complete = false;
  for (const row of queued.slice(0, ROWS_PER_TABLE)) await ctx.db.delete(row._id);

  const requested = await ctx.db
    .query("requests")
    .withIndex("by_room_status", (q) => q.eq("roomId", roomId))
    .take(ROWS_PER_TABLE + 1);
  if (requested.length > ROWS_PER_TABLE) complete = false;
  for (const row of requested.slice(0, ROWS_PER_TABLE)) await ctx.db.delete(row._id);

  const present = await ctx.db
    .query("presence")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(ROWS_PER_TABLE + 1);
  if (present.length > ROWS_PER_TABLE) complete = false;
  for (const row of present.slice(0, ROWS_PER_TABLE)) await ctx.db.delete(row._id);

  const said = await ctx.db
    .query("messages")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(ROWS_PER_TABLE + 1);
  if (said.length > ROWS_PER_TABLE) complete = false;
  for (const row of said.slice(0, ROWS_PER_TABLE)) await ctx.db.delete(row._id);

  return complete;
}
