"use client";
import { readLocal, useLocalValue, writeLocal } from "./local-store";

/**
 * The host's capability for one room.
 *
 * A browser can call any Convex mutation directly, with any arguments, so "is
 * this person the host" cannot be answered by an id that every listener can
 * read out of the room. It has to be a secret this browser holds: made here
 * when the room is created, sent with host-only mutations, and never returned
 * by a query. Losing it — a cleared browser, a different device — means losing
 * host rights to that room, the same way the anonymous identity already works.
 */
const key = (slug: string) => `vibe:host:${slug}`;

export function createHostToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function rememberHostToken(slug: string, token: string) {
  writeLocal(key(slug), token);
}

export function readHostToken(slug: string) {
  return readLocal(key(slug)) || null;
}

/** Null until hydration, like every other browser-stored value here. */
export function useHostToken(slug: string) {
  const [token] = useLocalValue(key(slug));
  return token || null;
}
