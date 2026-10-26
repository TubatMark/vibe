import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { cleanDisplayName, MAX_MESSAGE } from "./validate";
import { limitSendMessage } from "./limits";
import { touchRoom } from "./rooms";

export const list = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .order("desc")
      .take(100);
    return rows.reverse();
  },
});

export const send = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
    name: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { roomId, userId, name, text }) => {
    // Chat keeps its own line breaks, so only the length is capped here.
    const t = text.trim().slice(0, MAX_MESSAGE);
    if (!t) return;
    const room = await ctx.db.get(roomId);
    if (!room) throw new Error("Room not found");
    await limitSendMessage(ctx, roomId, userId);
    await touchRoom(ctx, room);
    await ctx.db.insert("messages", {
      roomId,
      userId,
      name: cleanDisplayName(name),
      text: t,
    });
  },
});
