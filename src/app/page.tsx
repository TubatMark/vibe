"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { ArrowRight, Check, Headphones, Link2, LoaderCircle, Plus, TvMinimalPlay } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useGuestNameConfirmed, useLocalUser } from "@/lib/user";
import { isDemo, makeSlug, rememberDemoRoom } from "@/lib/demo";
import { createHostToken, rememberHostToken } from "@/lib/host-token";
import { Brand, ThemeToggle } from "@/components/app-chrome";
import { DemoBanner } from "@/components/demo-banner";
import { SonicStage } from "@/components/sonic-stage";
import { useRoomConnected } from "@/components/connection-status";

export default function Home() {
  return isDemo ? <HomeView createRoom={async name => { const slug = makeSlug(); rememberDemoRoom(slug, name); return slug; }} /> : <HomeLive />;
}

function HomeLive() {
  const [user] = useLocalUser();
  const create = useMutation(api.rooms.create);
  // The host token is made here and kept here: the room stores it, no query
  // returns it, so only this browser can act as the host of what it creates.
  async function createRoom(name: string) {
    const hostToken = createHostToken();
    const slug = await create({ name, hostId: user!.id, hostToken });
    rememberHostToken(slug, hostToken);
    return slug;
  }
  return <HomeView createRoom={createRoom} />;
}

/** Accept an invite URL with a trailing slash, query or hash, or a bare code. */
function roomCode(value: string) {
  const clean = value.trim();
  let path = clean;
  if (/^https?:\/\//i.test(clean)) {
    try { path = new URL(clean).pathname; } catch { return null; }
  }
  const code = path.split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop()?.toLowerCase();
  return code && /^[a-z0-9_-]{3,64}$/.test(code) ? code : null;
}

function HomeView({ createRoom }: { createRoom: (name: string) => Promise<string> }) {
  const router = useRouter();
  const connected = useRoomConnected();
  const [user, rename] = useLocalUser();
  const [confirmed, confirmName] = useGuestNameConfirmed();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = displayName ?? (confirmed ? user?.name ?? "" : "");

  function selectMode(next: "create" | "join") { setMode(next); setError(""); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || busy || !name.trim() || !connected) return;
    const slug = mode === "join" ? roomCode(code) : null;
    if (mode === "join" && !slug) { setError("That invite doesn’t look right. Paste a room link or code."); return; }
    setBusy(true);
    setError("");
    try {
      rename(name);
      confirmName();
      const destination = slug ?? await createRoom(roomName.trim() || "Our listening room");
      router.push(`/r/${destination}`);
    } catch {
      setError("We couldn’t reach the room. Check your connection and try again.");
      setBusy(false);
    }
  }

  return <>
    {isDemo && <DemoBanner />}
    <div className="home-shell">
      <header className="site-header">
        <Brand />
        <p className="header-thought">A listening room for your people.</p>
        <nav className="header-nav" aria-label="Main navigation">
          <a href="#room-entry" onClick={() => selectMode("join")}>Got an invite? <span>Join a room</span></a>
          <ThemeToggle />
        </nav>
      </header>
      <main className="lobby">
        <section className="lobby-poster" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">Pass the aux.</h1>
            <p>Your friends. Your music.<br />One room, wherever you are.</p>
            <span className="poster-note"><span /> A shared queue. A little conversation.</span>
          </div>
          <SonicStage />
          <div className="poster-colophon"><span>Good music travels.</span><span>Bring someone along.</span></div>
        </section>
        <section className="room-entry" id="room-entry" aria-labelledby="entry-title">
          <div className="entry-intro"><Headphones size={27} strokeWidth={1.5} /><h2 id="entry-title">Make room <br />for good company.</h2><p>Pick a name. We’ll take it from there.</p></div>
          <div className="entry-tabs" role="tablist" aria-label="Room action" onKeyDown={e => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
            e.preventDefault();
            const next = e.key === "Home" ? "create" : e.key === "End" ? "join" : mode === "create" ? "join" : "create";
            selectMode(next);
            document.getElementById(`${next}-tab`)?.focus();
          }}>
            <button type="button" role="tab" tabIndex={mode === "create" ? 0 : -1} aria-selected={mode === "create"} aria-controls="entry-form" id="create-tab" onClick={() => selectMode("create")}><Plus size={17} /> Create a room</button>
            <button type="button" role="tab" tabIndex={mode === "join" ? 0 : -1} aria-selected={mode === "join"} aria-controls="entry-form" id="join-tab" onClick={() => selectMode("join")}><Link2 size={16} /> Join a room</button>
          </div>
          <form onSubmit={submit} id="entry-form" role="tabpanel" aria-labelledby={`${mode}-tab`}>
            <div className="form-field"><label htmlFor="display-name">Your name</label><input id="display-name" className="vibe-input" placeholder="The name your friends know" autoComplete="nickname" maxLength={24} value={name} onChange={e => setDisplayName(e.target.value)} required /></div>
            {mode === "create" ? <div className="form-field"><label htmlFor="room-name">Room name <span>optional</span></label><input id="room-name" className="vibe-input" placeholder="Kitchen disco, anyone?" maxLength={60} value={roomName} onChange={e => setRoomName(e.target.value)} /></div> : <div className="form-field"><label htmlFor="room-code">Room link or code</label><input id="room-code" className="vibe-input" placeholder="Paste the invite here" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={code} onChange={e => setCode(e.target.value)} required /></div>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="action-button" disabled={!connected || !user || !name.trim() || busy || (mode === "join" && !code.trim())}>{busy ? <><LoaderCircle className="spin" size={18} /> {mode === "create" ? "Creating your room…" : "Joining the room…"}</> : <>{mode === "create" ? "Create room" : "Join room"}<ArrowRight size={19} /></>}</button>
            <p className="entry-privacy"><Check size={13} /> No account. No email. Just you.</p>
          </form>
          <div className="entry-sources"><span>Bring a link from</span><div><span><TvMinimalPlay size={19} /> YouTube</span><span><SpotifyMark /> Spotify</span></div><small>YouTube is account-free. <br />Spotify playback needs a connected Premium account.</small></div>
          <details className="entry-help"><summary>First time here?</summary><p>Create a room and copy the invite link. Friends join with a name, add songs to the queue, and listen with you. You control playback; everyone controls their own volume.</p></details>
        </section>
      </main>
      <footer className="site-footer"><span>Different places. Same good song.</span><a href="#room-entry" onClick={() => selectMode("join")}>Have a room code? Join in <ArrowRight size={15} /></a></footer>
    </div>
  </>;
}

function SpotifyMark() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="11" /><path d="M6 9c4-1.5 8-1 12 1M7 12c3-1 7-.5 10 1M8 15c3-.7 5-.2 8 1" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" /></svg>; }
