import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Nothing in this app deletes itself, so these two jobs are what keep the
 * database from being a log of every room anyone ever opened. See
 * `convex/retention.ts` for the windows and why they are what they are.
 */
const crons = cronJobs();

crons.interval(
  "prune stale presence",
  { minutes: 5 },
  internal.retention.pruneStalePresence,
  {},
);

crons.interval(
  "prune idle rooms",
  { hours: 6 },
  internal.retention.pruneIdleRooms,
  {},
);

export default crons;
