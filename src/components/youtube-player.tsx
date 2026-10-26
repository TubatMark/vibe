"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Music4, RotateCw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  /** Host only: clicking the player toggles playback. Omitted for listeners. */
  onToggle?: () => void;
};

const DRIFT_TOLERANCE_S = 1.0;
const API_TIMEOUT_MS = 15_000;

/** What the IFrame API's error codes mean to a listener. */
function errorMessage(code: number) {
  switch (code) {
    case 100:
    case 105:
      return "this video was removed or is private";
    case 101:
    case 150:
      return "the owner doesn't allow this one to play outside YouTube";
    default:
      // Includes code 2 (bad parameter) and 5 (player error): the link already
      // resolved through oEmbed, so there is nothing useful to say about it.
      return "youtube couldn't play this one";
  }
}

let apiPromise: Promise<void> | null = null;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const prev = window.onYouTubeIframeAPIReady;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onerror = null;
      if (window.onYouTubeIframeAPIReady === onReady) window.onYouTubeIframeAPIReady = prev;
      if (error) {
        script.remove();
        apiPromise = null;
        reject(error);
      } else resolve();
    };
    const onReady = () => {
      try { prev?.(); } finally { finish(); }
    };
    const timeout = setTimeout(() => finish(new Error("YouTube took too long to respond.")), API_TIMEOUT_MS);
    window.onYouTubeIframeAPIReady = onReady;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => finish(new Error("Check your connection or content blocker, then try again."));
    document.head.appendChild(script);
  });
  return apiPromise;
}

/**
 * Thin wrapper over the YouTube IFrame API that follows room state:
 * loads the right video, plays/pauses, re-seeks when drift exceeds tolerance,
 * and applies a purely local volume.
 */
export function YouTubePlayer({ videoId, isPlaying, syncKey, getTargetMs, volume, onEnded, onToggle }: Props) {
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
  const resyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keyed by video so a stale failure disappears as soon as the track changes.
  const [error, setError] = useState<{ videoId: string; code: number } | null>(null);
  const [blockedVideo, setBlockedVideo] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiAttempt, setApiAttempt] = useState(0);

  const load = useCallback((id: string | null) => {
    loadedIdRef.current = id;
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    if (!id) {
      p.stopVideo();
      return;
    }
    const startS = getTargetRef.current() / 1000;
    if (isPlayingRef.current) p.loadVideoById(id, startS);
    else p.cueVideoById(id, startS);
  }, []);

  // Create the player once.
  useEffect(() => {
    let cancelled = false;
    const container = hostRef.current;
    loadApi().then(() => {
      if (cancelled || !container || playerRef.current) return;
      // The API replaces the element it's given with an iframe, so hand it a
      // throwaway child: the container stays ours to empty on teardown.
      const mount = document.createElement("div");
      mount.className = "size-full";
      container.replaceChildren(mount);
      playerRef.current = new YT.Player(mount, {
        width: "100%",
        height: "100%",
        playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            readyRef.current = true;
            setApiError(null);
            applyVolumeRef.current(volumeRef.current);
            // The track effect can run before the IFrame API is ready. Load
            // its saved id now so the first song does not wait for a change.
            load(loadedIdRef.current);
            sync(true);
          },
          onError: (e) =>
            setError(loadedIdRef.current ? { videoId: loadedIdRef.current, code: e.data } : null),
          onAutoplayBlocked: () => {
            if (isPlayingRef.current) setBlockedVideo(loadedIdRef.current);
          },
          onStateChange: (e) => {
            if (e.data !== YT.PlayerState.UNSTARTED) setError(null);
            if (e.data === YT.PlayerState.PLAYING) setBlockedVideo(null);
            if (e.data === YT.PlayerState.ENDED) onEndedRef.current();
            // If a listener manually pauses via keyboard etc., snap back to room state.
            if (e.data === YT.PlayerState.PAUSED && isPlayingRef.current) {
              if (resyncTimeoutRef.current) clearTimeout(resyncTimeoutRef.current);
              resyncTimeoutRef.current = setTimeout(() => {
                resyncTimeoutRef.current = null;
                sync(true);
              }, 300);
            }
          },
        },
      });
    }).catch((failure: unknown) => {
      if (!cancelled) setApiError(failure instanceof Error ? failure.message : "Check your connection and try again.");
    });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* already gone */
      }
      playerRef.current = null;
      readyRef.current = false;
      if (resyncTimeoutRef.current) clearTimeout(resyncTimeoutRef.current);
      resyncTimeoutRef.current = null;
      // A player that outlives its component keeps playing audio nothing can
      // reach, so make sure the container is empty either way.
      container?.replaceChildren();
    };
  }, [load, apiAttempt]);

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
      // Seeking CUED or UNSTARTED videos starts them. cueVideoById already
      // supplied the paused position, so only seek an actually paused player.
      if (state === YT.PlayerState.PAUSED && (force || Math.abs(p.getCurrentTime() - targetS) > DRIFT_TOLERANCE_S)) {
        p.seekTo(targetS, true);
      }
    }
  }

  // Load a new video when the room's track changes.
  useEffect(() => {
    load(videoId);
  }, [videoId, load]);

  function retry() {
    setError(null);
    load(videoId);
  }

  function retryApi() {
    setApiError(null);
    setApiAttempt((attempt) => attempt + 1);
  }

  // React to play/pause/seek changes immediately.
  useEffect(() => {
    sync(true);
  }, [isPlaying, syncKey]);

  // Periodic drift correction.
  useEffect(() => {
    const t = setInterval(() => sync(false), 2000);
    return () => clearInterval(t);
  }, []);

  // Local volume. setVolume on its own is inaudible while the embed is muted —
  // which is how browsers let a video autoplay — so mute state follows the slider.
  const applyVolumeRef = useRef<(v: number) => void>(() => {});
  const applyVolume = useCallback((v: number) => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    p.setVolume(v);
    if (v === 0) p.mute();
    else p.unMute();
  }, []);

  applyVolumeRef.current = applyVolume;

  useEffect(() => {
    applyVolume(volume);
  }, [volume, applyVolume]);

  // The browser can refuse unMute() until the listener interacts with the page,
  // so offer them a way to do that rather than leaving them in silence.
  const [needsUnmute, setNeedsUnmute] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      const p = playerRef.current;
      setNeedsUnmute(!!p && readyRef.current && volumeRef.current > 0 && p.isMuted());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  function unmute() {
    applyVolume(volumeRef.current);
    setNeedsUnmute(false);
  }

  function startListening() {
    if (!isPlayingRef.current || !loadedIdRef.current || !readyRef.current) return;
    // Call the local player's methods synchronously inside the user gesture.
    // The host's shared play/pause state stays untouched.
    applyVolume(volumeRef.current);
    sync(true);
    playerRef.current?.playVideo();
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <div ref={hostRef} className="absolute inset-0 size-full" />
      {/* Covers the iframe so nobody drives YouTube's own controls and desyncs the room.
          For the host it doubles as a play/pause target, routed through room state. */}
      {onToggle ? (
        <button
          type="button"
          className="absolute inset-0 cursor-pointer"
          onClick={onToggle}
          aria-label={isPlaying ? "pause" : "play"}
        />
      ) : (
        <div className="absolute inset-0" />
      )}

      {isPlaying && blockedVideo === videoId && videoId ? (
        <Button
          size="sm"
          variant="secondary"
          className="absolute bottom-3 left-3 shadow-lg"
          onClick={startListening}
        >
          <Volume2 /> Start listening
        </Button>
      ) : needsUnmute && videoId && (
        <Button
          size="sm"
          variant="secondary"
          className="absolute bottom-3 left-3 shadow-lg"
          onClick={unmute}
        >
          <Volume2 /> tap for sound
        </Button>
      )}

      {!videoId && (
        // Opaque: stopVideo() leaves the last frame on screen underneath.
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background text-muted-foreground">
          <Music4 className="size-6" />
          <p className="text-sm">nothing playing</p>
        </div>
      )}

      {error && error.videoId === videoId && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
          <AlertTriangle className="size-6 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{errorMessage(error.code)}</p>
            <p className="text-xs text-muted-foreground">
              Try again, or ask the host to skip this track.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={retry}>
            <RotateCw /> try again
          </Button>
        </div>
      )}

      {apiError && videoId && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center" role="alert">
          <AlertTriangle className="size-6 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">YouTube couldn’t load.</p>
            <p className="text-xs text-muted-foreground">{apiError}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={retryApi}>
            <RotateCw /> Try again
          </Button>
        </div>
      )}
    </div>
  );
}
