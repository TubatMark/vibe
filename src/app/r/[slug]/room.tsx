"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import {
  Check,
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
  Music2,
  ArrowLeft,
  ChevronRight,
  Headphones,
  Link2,
  LoaderCircle,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Send,
  TvMinimalPlay,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useGuestNameConfirmed, useLocalUser } from "@/lib/user";
import { useHostToken } from "@/lib/host-token";
import { useLocalVolume } from "@/lib/volume";
import { isDemo, useDemoRoom } from "@/lib/demo";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { YouTubePlayer } from "@/components/youtube-player";
import { SpotifyPlayer } from "@/components/spotify-player";
import { useSpotify } from "@/lib/spotify-auth";
import { detectSource, type Source } from "@/lib/track-source";
import { DemoBanner } from "@/components/demo-banner";
import { cn } from "@/lib/utils";
import { Avatar, Brand, NameGate, ThemeToggle } from "@/components/app-chrome";
import { RoomInvite } from "@/components/room-invite";
import { useRoomConnected } from "@/components/connection-status";
import "./room.css";

/**
 * The room renders from plain data plus a set of actions, so it can be driven by
 * Convex (RoomLive) or by the local demo store (RoomDemo) with no change to the UI.
 */
type Track = {
  /** YouTube video id, or Spotify track id. */
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  source?: Source;
};

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

type ActionResult = void | Promise<unknown>;

type RoomActions = {
  play: () => ActionResult;
  pause: () => ActionResult;
  skip: () => ActionResult;
  ended: (videoId: string) => ActionResult;
  setMode: (mode: "open" | "approval") => ActionResult;
  addTrack: (input: string) => Promise<"queued" | "requested">;
  removeTrack: (id: string) => ActionResult;
  moveTrack: (id: string, direction: "up" | "down") => ActionResult;
  approve: (id: string) => ActionResult;
  reject: (id: string) => ActionResult;
  sendMessage: (text: string) => ActionResult;
};

export function Room({ slug }: { slug: string }) {
  const [user, rename] = useLocalUser();
  const [confirmed, confirmName] = useGuestNameConfirmed();
  if (!user) return <Centered><LoaderCircle size={24} className="room-spinner" /><p>Opening the room…</p></Centered>;
  if (!confirmed) return <NameGate defaultName={user.name} onComplete={(name) => { rename(name); confirmName(); }} />;
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
  // Held only by the browser that created the room; the server never sends it.
  const hostToken = useHostToken(slug);

  const queue = useQuery(api.queue.list, roomId ? { roomId } : "skip");
  const requests = useQuery(api.requests.pending, roomId ? { roomId } : "skip");
  const listeners = useQuery(api.presence.list, roomId ? { roomId } : "skip");
  const messages = useQuery(api.messages.list, roomId ? { roomId } : "skip");

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
  const resolveSpotify = useAction(api.spotify.resolve);

  // ---- presence heartbeat
  useEffect(() => {
    if (!roomId) return;
    void heartbeat({ roomId, userId: user.id, name: user.name }).catch(() => {});
    const t = setInterval(
      () => void heartbeat({ roomId, userId: user.id, name: user.name }).catch(() => {}),
      10_000,
    );
    const onUnload = () => void leave({ roomId, userId: user.id }).catch(() => {});
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", onUnload);
      void leave({ roomId, userId: user.id }).catch(() => {});
    };
  }, [roomId, user.id, user.name, heartbeat, leave]);

  const actions: RoomActions = useMemo(() => {
    const id = roomId as Id<"rooms">;
    const who = { roomId: id, userId: user.id };
    // Host-only mutations carry the room's host token. The rest carry the
    // public guest id, which is all they are entitled to decide anything on.
    const asHost = { roomId: id, hostToken: hostToken ?? "" };
    return {
      play: () => play(asHost),
      pause: () => pause(asHost),
      skip: () => skip(asHost),
      ended: (videoId) => ended({ roomId: id, videoId }),
      setMode: (mode) => setMode({ ...asHost, mode }),
      addTrack: async (input) => {
        const source = detectSource(input);
        if (!source) throw new Error("paste a YouTube or Spotify track link");
        const track =
          source === "spotify"
            ? await resolveSpotify({ input })
            : { ...(await resolve({ input })), source: "youtube" as const };
        return addTrack({ ...who, userName: user.name, track, hostToken: hostToken ?? undefined });
      },
      removeTrack: (itemId) =>
        removeTrack({ ...who, itemId: itemId as Id<"queue">, hostToken: hostToken ?? undefined }),
      moveTrack: (itemId, direction) =>
        moveTrack({ ...asHost, itemId: itemId as Id<"queue">, direction }),
      approve: (requestId) => approve({ ...asHost, requestId: requestId as Id<"requests"> }),
      reject: (requestId) => reject({ ...asHost, requestId: requestId as Id<"requests"> }),
      sendMessage: (text) => sendMessage({ ...who, name: user.name, text }),
    };
  }, [roomId, hostToken, user.id, user.name, play, pause, skip, ended, setMode, resolve, resolveSpotify, addTrack, removeTrack, moveTrack, approve, reject, sendMessage]);

  if (room === undefined || (room && (!queue || !requests || !listeners || !messages))) return <Centered><LoaderCircle size={24} className="room-spinner" /><p>Opening the room…</p></Centered>;
  if (room === null) return <NotFound />;

  return (
    <RoomView
      room={room}
      contents={{ queue: queue!, requests: requests!, listeners: listeners!, messages: messages! }}
      actions={actions}
      user={user}
      rename={rename}
      canHost={!!hostToken}
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
        canHost={asHost}
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
  canHost,
}: {
  room: RoomData;
  contents: RoomContents;
  actions: RoomActions;
  user: { id: string; name: string };
  rename: (n: string) => void;
  /** Whether this browser holds the room's host token. */
  canHost?: boolean;
}) {
  // `room.hostId` still labels the host in the room; it no longer grants
  // anything, so the controls follow the capability this browser actually has.
  const isHost = canHost ?? room.hostId === user.id;
  const offsetRef = useRef(0);
  useEffect(() => {
    offsetRef.current = room.serverNow - Date.now();
  }, [room.serverNow]);
  const getTargetMs = useCallback(() => {
    if (!room.isPlaying) return room.pausedAt;
    return Date.now() + offsetRef.current - room.startedAt;
  }, [room.isPlaying, room.pausedAt, room.startedAt]);

  const [volume, setVolume] = useLocalVolume();
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  async function onAdd() {
    if (!input.trim() || adding || !connected) return;
    setAdding(true);
    setNotice(null);
    try {
      const result = await actions.addTrack(input.trim());
      setInput("");
      setNotice({ text: result === "requested" ? "Sent to the host for approval." : "Added to the queue.", error: false });
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : "Couldn't add that track. Check the link and try again.", error: true });
    } finally {
      setAdding(false);
    }
  }

  const connected = useRoomConnected();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const actionLocks = useRef(new Set<string>());
  async function runAction(key: string, action: () => ActionResult) {
    // End-of-track is a one-shot provider event. Let Convex queue that event
    // across a disconnect; only interactive changes wait for reconnection.
    if ((!connected && key !== "advance") || actionLocks.current.has(key)) return;
    actionLocks.current.add(key);
    setPendingActions(new Set(actionLocks.current));
    setActionError(null);
    try { await action(); }
    catch { setActionError("That change didn’t reach the room. Try again when you’re connected."); }
    finally { actionLocks.current.delete(key); setPendingActions(new Set(actionLocks.current)); }
  }

  const [chat, setChat] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const followChat = useRef(true);
  const lastMessageId = messages.at(-1)?._id ?? null;
  const [readMessageId, setReadMessageId] = useState(lastMessageId);
  const [chatInView, setChatInView] = useState(false);
  const [socialPanel, setSocialPanel] = useState<"chat" | "people">("chat");
  const [mobilePanel, setMobilePanel] = useState<"player" | "queue" | "chat" | "people">("player");
  const unreadStart = messages.findIndex(message => message._id === readMessageId);
  const unreadMessages = readMessageId === lastMessageId ? 0 : messages.slice(unreadStart < 0 ? 0 : unreadStart + 1).filter(message => message.userId !== user.id).length;

  function showLatestMessages() {
    const container = chatScrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
    followChat.current = true;
    setReadMessageId(lastMessageId);
  }
  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container) return;
    let intersecting = false;
    const syncVisibility = () => setChatInView(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting && entry.intersectionRatio >= .2;
      syncVisibility();
    }, { threshold: [0, .2], rootMargin: "0px 0px -72px 0px" });
    observer.observe(container);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", syncVisibility); };
  }, []);
  useEffect(() => {
    const container = chatScrollRef.current;
    if (container && chatInView && followChat.current && !document.hidden) {
      container.scrollTop = container.scrollHeight;
      // Message ids, rather than count, still change when the 100-message window rolls.
      setReadMessageId(lastMessageId);
    }
  }, [lastMessageId, mobilePanel, socialPanel, chatInView]);

  async function onSendMessage() {
    const text = chat.trim();
    if (!text || !connected || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setChatError(null);
    try {
      await actions.sendMessage(text);
      setChat(current => current.trim() === text ? "" : current);
      followChat.current = true;
      showLatestMessages();
    } catch { setChatError("Message not sent. Your draft is safe—try again."); }
    finally { sendingRef.current = false; setSending(false); }
  }

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user.name);
  const nameButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const syncKey = useMemo(() => room.startedAt + room.pausedAt, [room.startedAt, room.pausedAt]);
  const toggle =
    isHost && (room.current || queue.length > 0)
      ? () => void runAction("playback", room.isPlaying ? actions.pause : actions.play)
      : undefined;
  const host = listeners.find((listener) => listener.userId === room.hostId);

  function saveName() {
    if (nameDraft.trim()) rename(nameDraft);
    setEditingName(false);
    requestAnimationFrame(() => nameButtonRef.current?.focus());
  }
  function openMobilePanel(panel: "player" | "queue" | "chat" | "people") {
    setMobilePanel(panel);
    if (panel === "chat" || panel === "people") setSocialPanel(panel);
    requestAnimationFrame(() => {
      const target = panel === "player" ? document.querySelector(".room-listening") : panelRef.current;
      target?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
  }

  return (
    <main className="room-app" data-mobile-panel={mobilePanel}>
      <header className="room-topbar">
        <div className="room-topbar-left">
          <Brand compact />
          <span className="room-topbar-divider" aria-hidden="true" />
          <span className="room-breadcrumb"><Headphones size={15} /><span>Listening room</span><ChevronRight size={13} /><span>{room.slug}</span></span>
        </div>
        <div className="room-topbar-actions">
          <ThemeToggle />
          <RoomInvite slug={room.slug} roomName={room.name} />
        </div>
      </header>

      {actionError && <div className="room-action-error" role="alert"><span>{actionError}</span><button type="button" className="room-icon-button" aria-label="Dismiss error" onClick={() => setActionError(null)}><X size={16} /></button></div>}

      <div className="room-body">
        <div className="room-heading">
          <div>
            <Link href="/" className="room-back-link"><ArrowLeft size={14} /> Back to home</Link>
            <h1>{room.name}</h1>
            <div className="room-heading-meta">
              <span><Headphones size={14} />{listeners.length} {listeners.length === 1 ? "person" : "people"} listening</span>
              <span className="room-meta-dot" aria-hidden="true" />
              <span>{isHost ? "You're the host" : host ? `Hosted by ${host.name}` : "Shared listening room"}</span>
            </div>
          </div>
          <div className="room-avatars" aria-label={`${listeners.length} people in the room`}>
            {listeners.slice(0, 4).map((listener) => <Avatar key={listener._id} name={listener.name} />)}
            {listeners.length > 4 && <span className="room-avatar-overflow">+{listeners.length - 4}</span>}
          </div>
        </div>

        <div className="room-layout">
          <section className="room-listening" aria-label="Music player">
            <div className="room-player">
              <div className="room-player-label">
                <span className="room-play-state"><span className={cn("room-equalizer", room.isPlaying && "is-playing")} aria-hidden="true"><i /><i /><i /></span>{room.current ? room.isPlaying ? "Now playing" : "Playback paused" : "Ready when you are"}</span>
                <span className="room-source-label">{room.current?.source === "spotify" ? <><Music2 size={13} /> Spotify</> : <><TvMinimalPlay size={15} /> YouTube</>}</span>
              </div>
              <div className="room-player-screen">
                {room.current?.source === "spotify" ? (
                  <SpotifyPlayer
                    trackId={room.current.videoId}
                    isPlaying={room.isPlaying}
                    syncKey={syncKey}
                    getTargetMs={getTargetMs}
                    volume={volume}
                    artwork={room.current.thumbnail}
                    onEnded={() => { if (room.current) void runAction("advance", () => actions.ended(room.current!.videoId)); }}
                    onToggle={toggle}
                  />
                ) : (
                  <YouTubePlayer
                    videoId={room.current?.videoId ?? null}
                    isPlaying={room.isPlaying}
                    syncKey={syncKey}
                    getTargetMs={getTargetMs}
                    volume={volume}
                    onEnded={() => { if (room.current) void runAction("advance", () => actions.ended(room.current!.videoId)); }}
                    onToggle={toggle}
                  />
                )}
              </div>
              <div className="room-now-playing">
                <div className="room-track-heading">
                  <h2>{room.current?.title ?? "The next good song starts with you."}</h2>
                  <p>{room.current?.author ?? "Add a YouTube or Spotify track to get the room going."}</p>
                </div>
                {isHost && (
                  <div className="room-playback-controls">
                    <button type="button" className="room-play-button" onClick={() => void runAction("playback", room.isPlaying ? actions.pause : actions.play)} aria-label={room.isPlaying ? "Pause playback" : "Play music"} disabled={!connected || pendingActions.has("playback") || (!room.current && queue.length === 0)}>
                      {room.isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                    </button>
                    <button type="button" className="room-icon-button room-skip-button" onClick={() => void runAction("skip", actions.skip)} aria-label="Skip to the next track" disabled={!connected || pendingActions.has("skip") || !room.current}><SkipForward size={20} fill="currentColor" /></button>
                  </div>
                )}
              </div>
              <div className="room-player-footer">
                <span className="room-host-note">{isHost ? "You control what plays." : "The host controls playback."}</span>
                <div className="room-volume">
                  <button type="button" className="room-icon-button" onClick={() => setVolume(volume === 0 ? 60 : 0)} aria-label={volume === 0 ? "Unmute your audio" : "Mute your audio"}><VolumeIcon size={17} /></button>
                  <Slider value={[volume]} max={100} step={1} onValueChange={([v]) => setVolume(v)} aria-label="Your volume" className="room-volume-slider" />
                  <span className="room-volume-value">{volume}%</span>
                  <span className="room-volume-hint">Just you</span>
                </div>
              </div>
            </div>

            <form className="room-add-track" onSubmit={(e) => { e.preventDefault(); void onAdd(); }}>
              <div className="room-add-track-label"><Plus size={16} /><label htmlFor="room-track-link">{isHost || room.mode === "open" ? "Bring your taste to the queue" : "Got a good one? Send a request"}</label></div>
              <div className="room-add-track-fields">
                <div className="room-track-input-wrap"><Link2 size={17} /><Input id="room-track-link" ref={addInputRef} placeholder="YouTube or Spotify track link" value={input} onChange={(e) => { setInput(e.target.value); if (notice) setNotice(null); }} disabled={adding} autoComplete="off" /></div>
                <button className="room-button room-button-accent" type="submit" disabled={!connected || adding || !input.trim()}>{adding ? <LoaderCircle size={16} className="room-spinner" /> : <Plus size={16} />}<span>{adding ? "Adding…" : isHost || room.mode === "open" ? "Add track" : "Request track"}</span></button>
              </div>
              {notice && <p className={cn("room-notice", notice.error && "room-notice-error")} role={notice.error ? "alert" : "status"}>{notice.error ? <X size={13} /> : <Check size={13} />}{notice.text}</p>}
            </form>
          </section>

          <nav className="room-mobile-tabs" aria-label="Room sections">
            <button type="button" aria-pressed={mobilePanel === "player"} onClick={() => openMobilePanel("player")}><Headphones size={17} />Player</button>
            <button type="button" aria-pressed={mobilePanel === "queue"} onClick={() => openMobilePanel("queue")}><ListMusic size={17} />Queue<span>{queue.length}</span></button>
            <button type="button" aria-pressed={mobilePanel === "chat"} onClick={() => openMobilePanel("chat")}><MessageCircle size={16} />Chat{unreadMessages > 0 && <span className="room-unread" aria-label={`${unreadMessages} unread messages`}>{unreadMessages > 99 ? "99+" : unreadMessages}</span>}</button>
            <button type="button" aria-pressed={mobilePanel === "people"} onClick={() => openMobilePanel("people")}><Users size={17} />People<span>{listeners.length}</span></button>
          </nav>

          <span ref={panelRef} className="room-panel-anchor" aria-hidden="true" />
          <section className="room-queue" aria-label="Music queue">
            <div className="room-section-heading">
              <h2>Up next <span>{queue.length}</span></h2>
              {isHost ? <button type="button" className="room-mode-toggle" disabled={!connected || pendingActions.has("mode")} onClick={() => void runAction("mode", () => actions.setMode(room.mode === "open" ? "approval" : "open"))} title="Change who can add tracks">{room.mode === "open" ? <Unlock size={13} /> : <Lock size={13} />}{room.mode === "open" ? "Anyone can add" : "Host approval"}<ChevronRight size={12} /></button> : <span className="room-queue-mode">{room.mode === "open" ? "Everyone can add tracks" : "Requests go to the host"}</span>}
            </div>

            {isHost && requests.length > 0 && (
              <div className="room-requests">
                <div className="room-requests-heading"><span><Headphones size={14} /> Track requests <span>{requests.length}</span></span><small>Pick what joins the queue</small></div>
                {requests.map((request) => (
                  <TrackRow key={request._id} title={request.title} author={request.author} thumb={request.thumbnail} by={request.requestedByName} source={request.source} requested>
                    <button type="button" className="room-icon-button room-approve-button" disabled={!connected || pendingActions.has(request._id)} onClick={() => void runAction(request._id, () => actions.approve(request._id))} aria-label={`Approve ${request.title}`}><Check size={17} /><span className="room-track-action-label">Approve</span></button>
                    <button type="button" className="room-icon-button" disabled={!connected || pendingActions.has(request._id)} onClick={() => void runAction(request._id, () => actions.reject(request._id))} aria-label={`Decline ${request.title}`}><X size={16} /><span className="room-track-action-label">Decline</span></button>
                  </TrackRow>
                ))}
              </div>
            )}

            {queue.length === 0 ? (
              <div className="room-empty-queue"><ListMusic size={26} /><div><h3>There’s room for a good song.</h3><p>Add a track above and make it the next one.</p></div><button type="button" className="room-text-button" onClick={() => { addInputRef.current?.focus(); addInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Add a track <Plus size={14} /></button></div>
            ) : (
              <div className="room-track-list">
                {queue.map((track, index) => (
                  <TrackRow key={track._id} title={track.title} author={track.author} thumb={track.thumbnail} by={track.addedByName} source={track.source} position={index + 1} hasActions={isHost || track.addedBy === user.id}>
                    {isHost && <><button type="button" className="room-icon-button" disabled={!connected || pendingActions.has(track._id) || index === 0} onClick={() => void runAction(track._id, () => actions.moveTrack(track._id, "up"))} aria-label={`Move ${track.title} up`}><ArrowUp size={15} /><span className="room-track-action-label">Move up</span></button><button type="button" className="room-icon-button" disabled={!connected || pendingActions.has(track._id) || index === queue.length - 1} onClick={() => void runAction(track._id, () => actions.moveTrack(track._id, "down"))} aria-label={`Move ${track.title} down`}><ArrowDown size={15} /><span className="room-track-action-label">Move down</span></button></>}
                    {(isHost || track.addedBy === user.id) && <button type="button" className="room-icon-button room-remove-button" disabled={!connected || pendingActions.has(track._id)} onClick={() => void runAction(track._id, () => actions.removeTrack(track._id))} aria-label={`Remove ${track.title}`}><Trash2 size={15} /><span className="room-track-action-label">Remove track</span></button>}
                  </TrackRow>
                ))}
              </div>
            )}
            <div className="room-queue-footer"><span>Good music. Better company.</span><span><Music2 size={13} />YouTube & Spotify</span></div>
          </section>

          <aside className="room-social" data-social-panel={socialPanel} aria-label="People and chat">
            <div className="room-social-heading"><h2>The room</h2><span><Users size={13} />{listeners.length}</span></div>
            <div className="room-social-tabs" aria-label="Social sections"><button type="button" aria-pressed={socialPanel === "chat"} onClick={() => { setSocialPanel("chat"); followChat.current = true; }}><MessageCircle size={15} />Chat{unreadMessages > 0 && <span className="room-unread" aria-label={`${unreadMessages} unread messages`}>{unreadMessages > 99 ? "99+" : unreadMessages}</span>}</button><button type="button" aria-pressed={socialPanel === "people"} onClick={() => setSocialPanel("people")}><Users size={16} />People<span>{listeners.length}</span></button></div>

            <section className="room-chat" aria-label="Room conversation">
              <div ref={chatScrollRef} className="room-messages" onScroll={event => { const el = event.currentTarget; followChat.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; if (followChat.current) setReadMessageId(lastMessageId); }} role="log" aria-live="polite" aria-label="Messages">
                <div className="room-chat-welcome"><div className="room-chat-welcome-icon"><Headphones size={21} /></div><h3>You’re in good company.</h3><p>A shared queue. A place to catch up.<br />Make yourself at home.</p></div>
                {messages.map((message) => (
                  <div key={message._id} className={cn("room-message", message.userId === user.id && "room-message-own")}><Avatar name={message.name} size="sm" /><div><p className="room-message-name">{message.name}{message.userId === room.hostId && <span>Host</span>}{message.userId === user.id && <small>you</small>}</p><p className="room-message-text">{message.text}</p></div></div>
                ))}
              </div>
              {unreadMessages > 0 && <button type="button" className="room-new-messages" onClick={showLatestMessages}>{unreadMessages} new {unreadMessages === 1 ? "message" : "messages"}<ArrowDown size={14} /></button>}
              <form className="room-chat-form" aria-busy={sending} onSubmit={event => { event.preventDefault(); void onSendMessage(); }}><Input aria-label="Message the room" aria-describedby={chatError ? "chat-error" : undefined} value={chat} onChange={event => { setChat(event.target.value); setChatError(null); }} placeholder="Say something nice…" maxLength={500} /><button type="submit" className="room-icon-button room-send-button" disabled={!chat.trim() || sending || !connected} aria-label={sending ? "Sending message" : "Send message"}>{sending ? <LoaderCircle size={17} className="room-spinner" /> : <Send size={17} />}</button></form>
              {chatError && <p className="room-chat-error" id="chat-error" role="alert">{chatError}</p>}

            </section>

            <section className="room-people" aria-label="People in the room">
              <p className="room-people-caption">Different places. Same soundtrack.</p>
              <ul>{listeners.map((listener) => <li key={listener._id}><Avatar name={listener.name} /><div><span>{listener.name}{listener.userId === user.id && <small>you</small>}</span><p>{listener.userId === room.hostId ? "Hosting the room" : "Here for the music"}</p></div>{listener.userId === room.hostId && <span className="room-host-badge">Host</span>}</li>)}</ul>
            </section>

            <div className="room-identity">
              <Avatar name={user.name} size="sm" />
              {editingName ? <form className="room-name-form" onSubmit={(e) => { e.preventDefault(); saveName(); }}><Input autoFocus aria-label="Your display name" value={nameDraft} maxLength={24} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setEditingName(false); requestAnimationFrame(() => nameButtonRef.current?.focus()); } }} /><button type="submit" className="room-icon-button" aria-label="Save display name" disabled={!nameDraft.trim()}><Check size={15} /></button></form> : <><div><p>{user.name}</p><span>Here anonymously</span></div><button ref={nameButtonRef} type="button" className="room-icon-button" aria-label="Edit your display name" onClick={() => { setNameDraft(user.name); setEditingName(true); }}><Pencil size={14} /></button></>}
            </div>
            <SpotifyConnection />
          </aside>
        </div>
      </div>
    </main>
  );
}

/** Optional source connection; room identity remains an anonymous display name. */
function SpotifyConnection() {
  const spotify = useSpotify();
  if (!spotify.configured) return null;
  return (
    <div className="room-spotify-connection">
      <Music2 size={17} />
      <div><p>{spotify.connected ? spotify.profile?.name ?? "Spotify connected" : "Listening on Spotify?"}</p><span>{spotify.connected ? spotify.canPlay ? "Premium playback connected" : "Playback needs Spotify Premium" : "Connect Premium for Spotify playback"}</span></div>
      <button type="button" className="room-text-button" onClick={spotify.connected ? spotify.disconnect : spotify.connect}>{spotify.connected ? "Disconnect" : "Connect"}</button>
    </div>
  );
}

function NotFound() {
  return <Centered><Headphones size={30} /><h1>This room has gone quiet.</h1><p>Check the invite link, or start a new room.</p><Link className="room-button room-button-accent" href="/"><ArrowLeft size={15} /> Back to home</Link></Centered>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="room-centered">{children}</main>;
}

function TrackRow({ title, author, thumb, by, source, position, requested, hasActions, children }: { title: string; author: string; thumb: string; by: string; source?: Source; position?: number; requested?: boolean; hasActions?: boolean; children?: React.ReactNode }) {
  return (
    <div className={cn("room-track-row", requested && "room-track-request")}>
      {position !== undefined && <span className="room-track-position">{String(position).padStart(2, "0")}</span>}
      <div className="room-track-art">{thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" loading="lazy" />
      ) : <Music2 size={18} />}</div>
      <div className="room-track-info"><h3>{title}</h3><p>{author}</p></div>
      <span className="room-track-by" title={`${requested ? "Requested" : "Added"} by ${by}`}><Avatar name={by} size="sm" /><span>{by}</span></span>
      <span className="room-track-source" title={source === "spotify" ? "Spotify" : "YouTube"}>{source === "spotify" ? <Music2 size={14} /> : <TvMinimalPlay size={15} />}</span>
      <div className="room-track-actions">{children}</div>
      {!requested && hasActions && (
        <details className="room-track-options">
          <summary aria-label={`Track options for ${title}`}><MoreHorizontal size={20} /></summary>
          <div className="room-track-options-menu" onClick={(e) => {
            if ((e.target as HTMLElement).closest("button:not(:disabled)")) { const details = e.currentTarget.closest("details"); details?.removeAttribute("open"); details?.querySelector("summary")?.focus(); }
          }}>{children}</div>
        </details>
      )}
    </div>
  );
}
