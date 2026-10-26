"use client";
import { useMemo, useState } from "react";
import { nanoid } from "nanoid";
import type { LocalUser } from "./user";
import { detectSource, extractSpotifyTrackId, extractYouTubeId, type Source } from "./track-source";

/**
 * Local, in-memory stand-in for the Convex backend so every page can be clicked
 * through before a deployment exists. Active whenever NEXT_PUBLIC_CONVEX_URL is unset.
 * Nothing here is persisted — a reload starts the room over.
 */
export const isDemo = !process.env.NEXT_PUBLIC_CONVEX_URL;

export type Track = {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  source?: Source;
};

export type DemoRoom = {
  _id: string;
  slug: string;
  name: string;
  hostId: string;
  mode: "open" | "approval";
  current?: Track;
  isPlaying: boolean;
  startedAt: number;
  pausedAt: number;
  serverNow: number;
};

type QueueItem = Track & { _id: string; addedBy: string; addedByName: string };
type RequestItem = Track & { _id: string; requestedBy: string; requestedByName: string };
type Listener = { _id: string; userId: string; name: string };
type Message = { _id: string; userId: string; name: string; text: string };

type State = {
  room: DemoRoom;
  queue: QueueItem[];
  requests: RequestItem[];
  listeners: Listener[];
  messages: Message[];
};

const DEMO_HOST = "demo-host";
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const demoRoomKey = (slug: string) => `vibe:demo-room:${slug}`;

/** Keep the room name for this tab while its demo room is in memory. */
export function rememberDemoRoom(slug: string, name: string) {
  try {
    sessionStorage.setItem(demoRoomKey(slug), name.trim().slice(0, 80) || "After hours");
  } catch {
    // Demo mode remains usable when browser storage is unavailable.
  }
}

function demoRoomName(slug: string) {
  try {
    return sessionStorage.getItem(demoRoomKey(slug)) || "After hours";
  } catch {
    return "After hours";
  }
}

/** Room code in the same shape the server generates. */
export function makeSlug(len = 6) {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

const track = (videoId: string, title: string, author: string): Track => ({
  videoId,
  title,
  author,
  thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  source: "youtube",
});

function seed(slug: string, user: LocalUser): State {
  const now = Date.now();
  return {
    room: {
      _id: "demo-room",
      slug,
      name: demoRoomName(slug),
      hostId: user.id,
      mode: "approval",
      current: track("lTRiuFIWV54", "1 A.M Study Session", "Lofi Girl"),
      isPlaying: false,
      startedAt: now,
      pausedAt: 32_000,
      serverNow: now,
    },
    queue: [
      { _id: "q1", addedBy: "u2", addedByName: "neon fox", ...track("dQw4w9WgXcQ", "Never Gonna Give You Up", "Rick Astley") },
      { _id: "q2", addedBy: user.id, addedByName: user.name, ...track("ktvTqknDobU", "Radioactive", "Imagine Dragons") },
      { _id: "q3", addedBy: "u3", addedByName: "velvet owl", ...track("jfKfPfyJRdk", "lofi hip hop radio · beats to relax/study to", "Lofi Girl") },
    ],
    requests: [
      { _id: "r1", requestedBy: "u4", requestedByName: "dusty moth", ...track("hHW1oY26kxQ", "lofi hip hop radio · beats to relax/study to", "Lofi Girl") },
    ],
    listeners: [
      { _id: "p1", userId: user.id, name: user.name },
      { _id: "p2", userId: "u2", name: "neon fox" },
      { _id: "p3", userId: "u3", name: "velvet owl" },
      { _id: "p4", userId: "u4", name: "dusty moth" },
    ],
    messages: [
      { _id: "m1", userId: "u2", name: "neon fox", text: "ok this one goes hard" },
      { _id: "m2", userId: "u3", name: "velvet owl", text: "turning mine down for a sec, keep going" },
      { _id: "m3", userId: "u4", name: "dusty moth", text: "can i put something on after this" },
    ],
  };
}

/** Pop the next queued track into `current`, mirroring convex/rooms.ts `advance`. */
function advance(s: State): State {
  const now = Date.now();
  const [next, ...rest] = s.queue;
  if (!next) {
    return {
      ...s,
      room: { ...s.room, current: undefined, isPlaying: false, startedAt: now, pausedAt: 0, serverNow: now },
    };
  }
  return {
    ...s,
    queue: rest,
    room: {
      ...s.room,
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
      serverNow: now,
    },
  };
}

/** Same oEmbed lookup the Convex action does, run straight from the browser. */
async function resolveTrack(input: string): Promise<Track> {
  const source = detectSource(input);
  if (!source) throw new Error("paste a YouTube or Spotify track link");
  return source === "spotify" ? resolveSpotify(input) : resolveYouTube(input);
}

async function resolveYouTube(input: string): Promise<Track> {
  const videoId = extractYouTubeId(input)!;
  const fallback = track(videoId, "untitled track", "unknown");
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    );
    if (!res.ok) return fallback;
    const data = (await res.json()) as { title: string; author_name: string };
    return track(videoId, data.title, data.author_name);
  } catch {
    return fallback;
  }
}

/**
 * Demo mode has no server, so Spotify metadata comes from the public oEmbed
 * endpoint. It gives a title and artwork but no artist, which is enough to see
 * the queue; the real app resolves through convex/spotify.ts.
 */
async function resolveSpotify(input: string): Promise<Track> {
  const id = extractSpotifyTrackId(input)!;
  const fallback: Track = {
    videoId: id,
    title: "spotify track",
    author: "spotify",
    thumbnail: "",
    source: "spotify",
  };
  try {
    const res = await fetch(
      `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${id}`,
    );
    if (!res.ok) return fallback;
    const data = (await res.json()) as { title: string; thumbnail_url: string };
    return {
      videoId: id,
      title: data.title,
      author: "spotify",
      thumbnail: data.thumbnail_url,
      source: "spotify",
    };
  } catch {
    return fallback;
  }
}

export function useDemoRoom(slug: string, user: LocalUser) {
  const [state, setState] = useState(() => seed(slug, user));
  const [asHost, setAsHost] = useState(true);

  const actions = useMemo(
    () => ({
      play: () =>
        setState((s) => {
          const now = Date.now();
          if (!s.room.current) return advance(s);
          return { ...s, room: { ...s.room, isPlaying: true, startedAt: now - s.room.pausedAt, serverNow: now } };
        }),
      pause: () =>
        setState((s) => {
          const now = Date.now();
          return { ...s, room: { ...s.room, isPlaying: false, pausedAt: now - s.room.startedAt, serverNow: now } };
        }),
      skip: () => setState(advance),
      ended: () => setState(advance),
      setMode: (mode: "open" | "approval") =>
        setState((s) => ({ ...s, room: { ...s.room, mode, serverNow: Date.now() } })),
      addTrack: async (input: string) => {
        const t = await resolveTrack(input);
        const outcome = !asHost && state.room.mode === "approval" ? "requested" : "queued";
        setState((s) => {
          if (outcome === "requested") {
            return {
              ...s,
              requests: [...s.requests, { _id: nanoid(8), requestedBy: user.id, requestedByName: user.name, ...t }],
            };
          }
          return { ...s, queue: [...s.queue, { _id: nanoid(8), addedBy: user.id, addedByName: user.name, ...t }] };
        });
        return outcome;
      },
      removeTrack: (id: string) =>
        setState((s) => ({ ...s, queue: s.queue.filter((t) => t._id !== id) })),
      moveTrack: (id: string, direction: "up" | "down") =>
        setState((s) => {
          const i = s.queue.findIndex((t) => t._id === id);
          const j = direction === "up" ? i - 1 : i + 1;
          if (i < 0 || j < 0 || j >= s.queue.length) return s;
          const queue = [...s.queue];
          [queue[i], queue[j]] = [queue[j], queue[i]];
          return { ...s, queue };
        }),
      approve: (id: string) =>
        setState((s) => {
          const r = s.requests.find((x) => x._id === id);
          if (!r) return s;
          return {
            ...s,
            requests: s.requests.filter((x) => x._id !== id),
            queue: [
              ...s.queue,
              {
                _id: nanoid(8),
                addedBy: r.requestedBy,
                addedByName: r.requestedByName,
                videoId: r.videoId,
                title: r.title,
                author: r.author,
                thumbnail: r.thumbnail,
                source: r.source,
              },
            ],
          };
        }),
      reject: (id: string) =>
        setState((s) => ({ ...s, requests: s.requests.filter((x) => x._id !== id) })),
      sendMessage: (text: string) =>
        setState((s) => ({
          ...s,
          messages: [...s.messages, { _id: nanoid(8), userId: user.id, name: user.name, text }],
        })),
    }),
    [user.id, user.name, asHost, state.room.mode],
  );

  // Keep the seeded listener/queue names in step with a rename, and let the
  // banner flip host rights so both sides of the UI can be tried.
  const room = useMemo(
    () => ({ ...state.room, hostId: asHost ? user.id : DEMO_HOST }),
    [state.room, asHost, user.id],
  );
  const listeners = useMemo(
    () => state.listeners.map((l) => (l.userId === user.id ? { ...l, name: user.name } : l)),
    [state.listeners, user.name, user.id],
  );

  return { ...state, room, listeners, actions, asHost, setAsHost };
}
