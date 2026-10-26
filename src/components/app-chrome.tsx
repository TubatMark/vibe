"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Headphones, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useLocalValue } from "@/lib/local-store";

const initialTheme = () => "light";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link className={`brand${compact ? " brand-compact" : ""}`} href="/" aria-label="vibe home"><Image src="/brand/vibe-wordmark.png" alt="vibe" width={2001} height={786} sizes={compact ? "100px" : "124px"} priority className="brand-wordmark" /></Link>;
}

export function ThemeToggle() {
  const [theme, setTheme] = useLocalValue("vibe:theme", initialTheme);
  const light = theme === "light";
  function toggle() {
    const next = light ? "dark" : "light";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    setTheme(next);
  }
  return <button type="button" className="icon-button theme-toggle" onClick={toggle} aria-label={`Switch to ${light ? "dark" : "light"} theme`} title={`Switch to ${light ? "dark" : "light"} theme`}>{light ? <Moon size={18} /> : <Sun size={18} />}</button>;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const color = Array.from(name).reduce((sum, c) => sum + c.charCodeAt(0), 0) % 5;
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
  return <span className={`avatar avatar-${color} avatar-${size}`} aria-hidden="true">{initials}</span>;
}

export function NameGate({ onComplete, defaultName = "" }: { onComplete: (name: string) => void; defaultName?: string }) {
  const [name, setName] = useState("");
  return <div className="name-gate"><header className="site-header"><Brand /><ThemeToggle /></header><main className="name-gate-main"><div className="entry-art"><Headphones size={42} strokeWidth={1.4} /></div><h1>You’re invited.</h1><p>One name and you’re in.<br />What should the room call you?</p><form onSubmit={e => { e.preventDefault(); if (name.trim()) onComplete(name.trim()); }}><label htmlFor="guest-name">Your name</label><input id="guest-name" className="vibe-input" value={name} onChange={e => setName(e.target.value)} placeholder={defaultName || "The name your friends know"} maxLength={24} autoComplete="nickname" autoFocus required /><button className="action-button" disabled={!name.trim()}>Join room <ArrowRight size={18} /></button></form><span className="quiet-note">Just a name. No account needed.</span></main></div>;
}
