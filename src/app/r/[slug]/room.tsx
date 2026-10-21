"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import {
  Check,
  Copy,
  ListMusic,
  Pause,
  Play,
  Plus,
  SkipForward,
  Trash2,
  Users,
  Volume1,
  Volume2,
  VolumeX,
  X,
  ArrowUp,
  ArrowDown,
  Lock,
  Unlock,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useLocalUser } from "@/lib/user";
import { useLocalVolume } from "@/lib/volume";
import { isDemo, useDemoRoom } from "@/lib/demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { YouTubePlayer } from "@/components/youtube-player";
import { DemoBanner } from "@/components/demo-banner";
import { cn } from "@/lib/utils";

/**
 * The room renders from plain data plus a set of actions, so it can be driven by
 * Convex (RoomLive) or by the local demo store (RoomDemo) with no change to the UI.
 */
type Track = { videoId: string; title: string; author: string; thumbnail: string };

type RoomData = {
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

type RoomContents = {
  queue: (Track & { _id: string; addedBy: string; addedByName: string })[];
  requests: (Track & { _id: string; requestedBy: string; requestedByName: string })[];
  listeners: { _id: string; userId: string; name: string }[];
  messages: { _id: string; userId: string; name: string; text: string }[];
};

type RoomActions = {
  play: () => void;
  pause: () => void;
  skip: () => void;
  ended: (videoId: string) => void;
  setMode: (mode: "open" | "approval") => void;
  addTrack: (input: string) => Promise<"queued" | "requested">;
  removeTrack: (id: string) => void;
  moveTrack: (id: string, direction: "up" | "down") => void;
  approve: (id: string) => void;
  reject: (id: string) => void;
  sendMessage: (text: string) => void;
};

export function Room({ slug }: { slug: string }) {
  const [user, rename] = useLocalUser();
  if (!user) return <Centered>loading…</Centered>;
  return isDemo ? (
    <RoomDemo slug={slug} user={user} rename={rename} />
  ) : (
    <RoomLive slug={slug} user={user} rename={rename} />
  );
}

/* ---------------------------------------------------------------- live ---- */

function RoomLive({
  slug,
  user,
  rename,
}: {
  slug: string;
  user: { id: string; name: string };
  rename: (n: string) => void;
}) {
  const room = useQuery(api.rooms.getBySlug, { slug });
  const roomId = room?._id;

  const queue = useQuery(api.queue.list, roomId ? { roomId } : "skip") ?? [];
  const requests = useQuery(api.requests.pending, roomId ? { roomId } : "skip") ?? [];
  const listeners = useQuery(api.presence.list, roomId ? { roomId } : "skip") ?? [];
  const messages = useQuery(api.messages.list, roomId ? { roomId } : "skip") ?? [];

  const play = useMutation(api.rooms.play);
  const pause = useMutation(api.rooms.pause);
  const skip = useMutation(api.rooms.skip);
  const ended = useMutation(api.rooms.ended);
  const setMode = useMutation(api.rooms.setMode);
  const addTrack = useMutation(api.queue.add);
  const removeTrack = useMutation(api.queue.remove);
  const moveTrack = useMutation(api.queue.move);
  const approve = useMutation(api.requests.approve);
  const reject = useMutation(api.requests.reject);
  const heartbeat = useMutation(api.presence.heartbeat);
  const leave = useMutation(api.presence.leave);
  const sendMessage = useMutation(api.messages.send);
  const resolve = useAction(api.youtube.resolve);

  // ---- presence heartbeat
  useEffect(() => {
    if (!roomId) return;
    heartbeat({ roomId, userId: user.id, name: user.name });
    const t = setInterval(
      () => heartbeat({ roomId, userId: user.id, name: user.name }),
      10_000,
    );
    const onUnload = () => leave({ roomId, userId: user.id });
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", onUnload);
      leave({ roomId, userId: user.id });
    };
  }, [roomId, user.id, user.name, heartbeat, leave]);

  const actions: RoomActions = useMemo(() => {
    const id = roomId as Id<"rooms">;
    const who = { roomId: id, userId: user.id };
    return {
      play: () => void play(who),
      pause: () => void pause(who),
      skip: () => void skip(who),
      ended: (videoId) => void ended({ roomId: id, videoId }),
      setMode: (mode) => void setMode({ ...who, mode }),
      addTrack: async (input) => {
        const track = await resolve({ input });
        return addTrack({ ...who, userName: user.name, track });
      },
      removeTrack: (itemId) => void removeTrack({ ...who, itemId: itemId as Id<"queue"> }),
      moveTrack: (itemId, direction) =>
        void moveTrack({ ...who, itemId: itemId as Id<"queue">, direction }),
      approve: (requestId) => void approve({ ...who, requestId: requestId as Id<"requests"> }),
      reject: (requestId) => void reject({ ...who, requestId: requestId as Id<"requests"> }),
      sendMessage: (text) => void sendMessage({ ...who, name: user.name, text }),
    };
  }, [roomId, user.id, user.name, play, pause, skip, ended, setMode, resolve, addTrack, removeTrack, moveTrack, approve, reject, sendMessage]);

  if (room === undefined) return <Centered>loading…</Centered>;
  if (room === null) return <NotFound />;

  return (
    <RoomView
      room={room}
      contents={{ queue, requests, listeners, messages }}
      actions={actions}
      user={user}
      rename={rename}
    />
  );
}

/* ---------------------------------------------------------------- demo ---- */

/** Everything in memory: no deployment, no persistence, reload resets the room. */
function RoomDemo({
  slug,
  user,
  rename,
}: {
  slug: string;
  user: { id: string; name: string };
  rename: (n: string) => void;
}) {
  const { room, queue, requests, listeners, messages, actions, asHost, setAsHost } =
    useDemoRoom(slug, user);

  return (
    <>
      <DemoBanner asHost={asHost} onToggle={() => setAsHost((h) => !h)} />
      <RoomView
        key={asHost ? "host" : "guest"}
        room={room}
        contents={{ queue, requests, listeners, messages }}
        actions={actions}
        user={user}
        rename={rename}
      />
    </>
  );
}

/* ---------------------------------------------------------------- view ---- */

function RoomView({
  room,
  contents: { queue, requests, listeners, messages },
  actions,
  user,
  rename,
}: {
  room: RoomData;
  contents: RoomContents;
  actions: RoomActions;
  user: { id: string; name: string };
  rename: (n: string) => void;
}) {
  const isHost = room.hostId === user.id;

  // ---- clock sync: estimate serverNow - clientNow from each room update
  const offsetRef = useRef(0);
  useEffect(() => {
    offsetRef.current = room.serverNow - Date.now();
  }, [room.serverNow]);
  const getTargetMs = useCallback(() => {
    if (!room.isPlaying) return room.pausedAt;
    return Date.now() + offsetRef.current - room.startedAt;
  }, [room.isPlaying, room.pausedAt, room.startedAt]);

  // ---- local volume (never synced)
  const [volume, setVolume] = useLocalVolume();
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  // ---- add track
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  async function onAdd() {
    if (!input.trim()) return;
    setAdding(true);
    setNotice(null);
    try {
      const result = await actions.addTrack(input);
      setInput("");
      setNotice(result === "requested" ? "sent to host for approval" : "added to queue");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "couldn't add that");
    } finally {
      setAdding(false);
      setTimeout(() => setNotice(null), 3000);
    }
  }

  // ---- chat
  const [chat, setChat] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatMounted = useRef(false);
  useEffect(() => {
    // Skip the first run: on narrow screens scrolling the chat into view on load
    // would drag the whole page past the player.
    if (!chatMounted.current) {
      chatMounted.current = true;
      return;
    }
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // ---- copy link
  const [copied, setCopied] = useState(false);
  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const [editingName, setEditingName] = useState(false);
  const syncKey = useMemo(() => room.startedAt + room.pausedAt, [room.startedAt, room.pausedAt]);

  return (
    <main className="flex flex-1 flex-col lg:flex-row gap-4 p-4 lg:h-dvh lg:overflow-hidden">
      {/* ---------- left: player + controls ---------- */}
      <section className="flex flex-col gap-3 lg:flex-[3] min-w-0">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-lg leading-tight">{room.name}</h1>
            <p className="text-xs text-muted-foreground font-mono">/r/{room.slug}</p>
          </div>
          <div className="flex items-center gap-2">
            {isHost && <Badge variant="secondary">host</Badge>}
            <Button variant="outline" size="sm" onClick={copyLink}>
              {copied ? <Check /> : <Copy />} {copied ? "copied" : "invite"}
            </Button>
          </div>
        </header>

        <YouTubePlayer
          videoId={room.current?.videoId ?? null}
          isPlaying={room.isPlaying}
          syncKey={syncKey}
          getTargetMs={getTargetMs}
          volume={volume}
          onEnded={() => room.current && actions.ended(room.current.videoId)}
          onToggle={
            isHost && (room.current || queue.length > 0)
              ? () => (room.isPlaying ? actions.pause() : actions.play())
              : undefined
          }
        />

        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {room.current ? (
                <>
                  <p className="truncate font-medium">{room.current.title}</p>
                  <p className="truncate text-sm text-muted-foreground">{room.current.author}</p>
                </>
              ) : (
                <p className="text-muted-foreground">add a song below to get started</p>
              )}
            </div>
            {isHost && (
              <div className="flex shrink-0 gap-1">
                {room.isPlaying ? (
                  <Button size="icon" variant="secondary" onClick={actions.pause} aria-label="pause">
                    <Pause />
                  </Button>
                ) : (
                  <Button size="icon" onClick={actions.play} aria-label="play" disabled={!room.current && queue.length === 0}>
                    <Play />
                  </Button>
                )}
                <Button size="icon" variant="secondary" onClick={actions.skip} aria-label="skip" disabled={!room.current}>
                  <SkipForward />
                </Button>
              </div>
            )}
          </div>

          {/* local volume */}
          <div className="flex items-center gap-3">
            <button
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => setVolume(volume === 0 ? 60 : 0)}
              aria-label="mute"
            >
              <VolumeIcon className="size-5" />
            </button>
            <Slider value={[volume]} max={100} step={1} onValueChange={([v]) => setVolume(v)} className="flex-1" />
            <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{volume}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            volume is just yours — turn it down to talk, everyone else stays loud.
          </p>
        </div>

        {/* add / request */}
        <div className="flex gap-2">
          <Input
            placeholder="paste a YouTube link…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
            disabled={adding}
          />
          <Button onClick={onAdd} disabled={adding || !input.trim()}>
            <Plus /> {isHost || room.mode === "open" ? "add" : "request"}
          </Button>
        </div>
        {notice && <p className="text-xs text-muted-foreground -mt-1">{notice}</p>}
      </section>

      {/* ---------- right: queue / requests / people / chat ---------- */}
      <aside className="flex flex-col gap-4 lg:flex-[2] min-w-0 lg:overflow-y-auto">
        {/* mode toggle */}
        {isHost && (
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={() => actions.setMode(room.mode === "open" ? "approval" : "open")}
          >
            {room.mode === "open" ? <Unlock /> : <Lock />}
            {room.mode === "open" ? "anyone can add to queue" : "requests need your approval"}
          </Button>
        )}

        {/* requests */}
        {isHost && requests.length > 0 && (
          <Panel title={`requests · ${requests.length}`}>
            {requests.map((r) => (
              <TrackRow key={r._id} title={r.title} author={r.author} thumb={r.thumbnail} by={r.requestedByName}>
                <Button size="icon-sm" onClick={() => actions.approve(r._id)} aria-label="approve">
                  <Check />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => actions.reject(r._id)} aria-label="reject">
                  <X />
                </Button>
              </TrackRow>
            ))}
          </Panel>
        )}

        {/* queue */}
        <Panel title={<><ListMusic className="size-4" /> up next · {queue.length}</>}>
          {queue.length === 0 && <p className="text-sm text-muted-foreground px-1">queue is empty</p>}
          {queue.map((t, i) => (
            <TrackRow key={t._id} title={t.title} author={t.author} thumb={t.thumbnail} by={t.addedByName}>
              {isHost && (
                <>
                  <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => actions.moveTrack(t._id, "up")} aria-label="move up">
                    <ArrowUp />
                  </Button>
                  <Button size="icon-sm" variant="ghost" disabled={i === queue.length - 1} onClick={() => actions.moveTrack(t._id, "down")} aria-label="move down">
                    <ArrowDown />
                  </Button>
                </>
              )}
              {(isHost || t.addedBy === user.id) && (
                <Button size="icon-sm" variant="ghost" onClick={() => actions.removeTrack(t._id)} aria-label="remove">
                  <Trash2 />
                </Button>
              )}
            </TrackRow>
          ))}
        </Panel>

        {/* listeners */}
        <Panel title={<><Users className="size-4" /> in the room · {listeners.length}</>}>
          <ul className="flex flex-wrap gap-1.5">
            {listeners.map((l) => (
              <li key={l._id}>
                {l.userId === user.id ? (
                  editingName ? (
                    <Input
                      autoFocus
                      defaultValue={user.name}
                      className="h-7 w-36 text-xs"
                      onBlur={(e) => { rename(e.target.value); setEditingName(false); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                  ) : (
                    <button onClick={() => setEditingName(true)} className="cursor-pointer">
                      <Badge>{l.name} (you)</Badge>
                    </button>
                  )
                ) : (
                  <Badge variant="secondary">
                    {l.name}
                    {l.userId === room.hostId && " ★"}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        {/* chat */}
        <Panel title="chat" className="flex-1 min-h-48">
          <div className="flex-1 overflow-y-auto space-y-1 text-sm max-h-64">
            {messages.map((m) => (
              <p key={m._id} className="break-words">
                <span className={cn("font-medium", m.userId === user.id && "text-muted-foreground")}>{m.name}</span>{" "}
                <span className="text-foreground/90">{m.text}</span>
              </p>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form
            className="flex gap-2 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!chat.trim()) return;
              actions.sendMessage(chat);
              setChat("");
            }}
          >
            <Input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="say something" className="h-8 text-sm" />
            <Button size="sm" type="submit" variant="secondary" disabled={!chat.trim()}>send</Button>
          </form>
        </Panel>
      </aside>
    </main>
  );
}

function NotFound() {
  return (
    <Centered>
      <p>room not found</p>
      <Button asChild variant="secondary">
        <Link href="/">go home</Link>
      </Button>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      {children}
    </main>
  );
}

function Panel({ title, children, className }: { title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2 rounded-xl border bg-card p-3", className)}>
      <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function TrackRow({ title, author, thumb, by, children }: { title: string; author: string; thumb: string; by: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-accent/50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb} alt="" className="h-10 w-[71px] shrink-0 rounded object-cover bg-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{author} · {by}</p>
      </div>
      <div className="flex shrink-0 gap-0.5">{children}</div>
    </div>
  );
}
