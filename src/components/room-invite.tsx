"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Link2, Share2, X } from "lucide-react";

/** A disclosure keeps sharing available even when clipboard APIs are blocked. */
export function RoomInvite({ slug, roomName }: { slug: string; roomName: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [canShare, setCanShare] = useState(false);
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [sharing, setSharing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const id = useId();

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  async function copy(kind: "link" | "code") {
    setCopied(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(kind === "link" ? url : slug);
      setCopied(kind);
      setStatus(kind === "link" ? "Invite link copied." : "Room code copied.");
    } catch {
      const input = kind === "link" ? linkRef.current : codeRef.current;
      input?.focus();
      input?.select();
      setStatus("Selected for you. Use your device’s Copy command to copy it.");
    }
  }

  async function share() {
    if (sharing) return;
    setSharing(true);
    setStatus("");
    try {
      await navigator.share({ title: `${roomName} · vibe`, text: "Come listen with me.", url });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setStatus("Sharing is unavailable here. Copy the link or room code instead.");
      }
    } finally {
      setSharing(false);
    }
  }

  return <div ref={rootRef} className="room-invite" onKeyDown={event => {
    if (event.key === "Escape" && open) { event.preventDefault(); close(); }
  }}>
    <button ref={triggerRef} type="button" className="room-button room-invite-button" aria-expanded={open} aria-controls={id} onClick={() => {
      setUrl(`${window.location.origin}/r/${encodeURIComponent(slug)}`);
      setCanShare(typeof navigator.share === "function");
      setStatus("");
      setCopied(null);
      setOpen(value => !value);
    }}><Link2 size={16} /><span>Invite friends</span></button>
    {open && <section id={id} className="room-invite-panel" aria-label="Invite friends">
      <div className="room-invite-heading"><h2>Good music travels.</h2><button type="button" className="room-icon-button" aria-label="Close invite options" onClick={close}><X size={17} /></button></div>
      <p>Send the link, or share the code for friends to enter on the home page.</p>
      <label htmlFor={`${id}-link`}>Room link</label>
      <div className="room-invite-field"><input ref={linkRef} id={`${id}-link`} value={url} readOnly onFocus={event => event.target.select()} /><button type="button" className="room-icon-button" aria-label="Copy room link" onClick={() => void copy("link")}>{copied === "link" ? <Check size={17} /> : <Copy size={17} />}</button></div>
      <label htmlFor={`${id}-code`}>Room code</label>
      <div className="room-invite-field room-invite-code"><input ref={codeRef} id={`${id}-code`} value={slug} readOnly onFocus={event => event.target.select()} /><button type="button" className="room-icon-button" aria-label="Copy room code" onClick={() => void copy("code")}>{copied === "code" ? <Check size={17} /> : <Copy size={17} />}</button></div>
      {canShare && <button type="button" className="room-button room-button-accent room-native-share" disabled={sharing} onClick={() => void share()}><Share2 size={16} />{sharing ? "Opening share options…" : "Share invite"}</button>}
      <p className="room-invite-status" role="status">{status || "Friends join with a name. No account needed."}</p>
    </section>}
  </div>;
}
