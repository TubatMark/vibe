import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { enqueue } from "./queue";
import { requireHost } from "./rooms";

export const pending = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) =>
    ctx.db
      .query("requests")
      .withIndex("by_room_status", (q) =>
        q.eq("roomId", roomId).eq("status", "pending"),
      )
      .collect(),
});

export const approve = mutation({
  args: { roomId: v.id("rooms"), userId: v.string(), requestId: v.id("requests") },
  handler: async (ctx, { roomId, userId, requestId }) => {
    await requireHost(ctx, roomId, userId);
    const r = await ctx.db.get(requestId);
    if (!r || r.roomId !== roomId || r.status !== "pending") return;
    await ctx.db.patch(requestId, { status: "approved" });
    await enqueue(
      ctx,
      roomId,
      { videoId: r.videoId, title: r.title, author: r.author, thumbnail: r.thumbnail },
      { id: r.requestedBy, name: r.requestedByName },
    );
  },
});

export const reject = mutation({
  args: { roomId: v.id("rooms"), userId: v.string(), requestId: v.id("requests") },
  handler: async (ctx, { roomId, userId, requestId }) => {
    await requireHost(ctx, roomId, userId);
    const r = await ctx.db.get(requestId);
    if (!r || r.roomId !== roomId) return;
    await ctx.db.patch(requestId, { status: "rejected" });
  },
});
