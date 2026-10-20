"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Props = {
  videoId: string | null;
  isPlaying: boolean;
  /** Changes whenever the host seeks/plays/pauses — forces an immediate re-sync. */
  syncKey: number;
  /** Returns the room's current position in ms, using the synced clock. */
  getTargetMs: () => number;
  volume: number; // 0–100, local only
  onEnded: () => void;
};

const DRIFT_TOLERANCE_S = 1.0;

let apiPromise: Promise<void> | null = null;
function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    if (window.YT?.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiPromise;
}

/**
 * Thin wrapper over the YouTube IFrame API that follows room state:
 * loads the right video, plays/pauses, re-seeks when drift exceeds tolerance,
 * and applies a purely local volume.
 */
export function YouTubePlayer({ videoId, isPlaying, syncKey, getTargetMs, volume, onEnded }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const readyRef = useRef(false);
  const loadedIdRef = useRef<string | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const getTargetRef = useRef(getTargetMs);
  getTargetRef.current = getTargetMs;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  // Create the player once.
  useEffect(() => {
    let cancelled = false;
    loadApi().then(() => {
      if (cancelled || !hostRef.current || playerRef.current) return;
      playerRef.current = new YT.Player(hostRef.current, {
        width: "100%",
        height: "100%",
        playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            readyRef.current = true;
            playerRef.current?.setVolume(volumeRef.current);
            sync(true);
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED) onEndedRef.current();
            // If a listener manually pauses via keyboard etc., snap back to room state.
            if (e.data === YT.PlayerState.PAUSED && isPlayingRef.current) {
              setTimeout(() => sync(true), 300);
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      readyRef.current = false;
    };
  }, []);

  function sync(force = false) {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    const id = loadedIdRef.current;
    if (!id) {
      p.stopVideo();
      return;
    }
    const targetS = getTargetRef.current() / 1000;
    const state = p.getPlayerState();
    if (isPlayingRef.current) {
      const drift = Math.abs(p.getCurrentTime() - targetS);
      if (force || drift > DRIFT_TOLERANCE_S) p.seekTo(targetS, true);
      if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) p.playVideo();
    } else {
      if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) p.pauseVideo();
      if (force || Math.abs(p.getCurrentTime() - targetS) > DRIFT_TOLERANCE_S) p.seekTo(targetS, true);
    }
  }

  // Load a new video when the room's track changes.
  useEffect(() => {
    loadedIdRef.current = videoId;
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    if (!videoId) {
      p.stopVideo();
      return;
    }
    const startS = getTargetRef.current() / 1000;
    if (isPlayingRef.current) p.loadVideoById(videoId, startS);
    else p.cueVideoById(videoId, startS);
  }, [videoId]);

  // React to play/pause/seek changes immediately.
  useEffect(() => {
    sync(true);
  }, [isPlaying, syncKey]);

  // Periodic drift correction.
  useEffect(() => {
    const t = setInterval(() => sync(false), 2000);
    return () => clearInterval(t);
  }, []);

  // Local volume.
  useEffect(() => {
    if (readyRef.current) playerRef.current?.setVolume(volume);
  }, [volume]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <div ref={hostRef} className="absolute inset-0 size-full" />
      {/* Block direct interaction so listeners can't desync themselves. Host controls live in the UI. */}
      <div className="absolute inset-0" />
    </div>
  );
}
