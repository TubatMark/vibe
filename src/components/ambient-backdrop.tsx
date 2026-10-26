"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { useLocalValue } from "@/lib/local-store";
import "./ambient-backdrop.css";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeToMotion(listener: () => void) {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function readReducedMotion() {
  return window.matchMedia(MOTION_QUERY).matches;
}
function serverReducedMotion() {
  return false;
}

/** Quiet, oversized broadcast rings connect the room to its graphic cover. */
export function AmbientBackdrop() {
  const backdropRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [preference, setPreference] = useLocalValue("vibe:atmosphere-paused");
  const reduced = useSyncExternalStore(subscribeToMotion, readReducedMotion, serverReducedMotion);
  const paused = preference === "true";

  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    function syncVisibility() {
      backdrop!.setAttribute("data-hidden", String(document.hidden));
    }
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  const Icon = paused ? Play : Pause;
  const label = paused ? "Resume background motion" : "Pause background motion";

  return (
    <>
      <div
        ref={backdropRef}
        className="ambient-backdrop"
        data-paused={paused || reduced}
        aria-hidden="true"
      >
        <span className="ambient-backdrop__ring ambient-backdrop__ring--one" />
        <span className="ambient-backdrop__ring ambient-backdrop__ring--two" />
        <span className="ambient-backdrop__ring ambient-backdrop__ring--three" />
        <span className="ambient-backdrop__ring ambient-backdrop__ring--four" />
      </div>
      {pathname.startsWith("/r/") && !reduced && (
        <button
          type="button"
          className="ambient-backdrop__control"
          onClick={() => setPreference(paused ? "false" : "true")}
          aria-label={label}
          aria-pressed={!paused}
          title={label}
        >
          <Icon size={12} strokeWidth={1.7} aria-hidden="true" />
          <span>{paused ? "Resume motion" : "Pause motion"}</span>
        </button>
      )}
    </>
  );
}
