"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Music4, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAccessToken,
  hostIsUsable,
  spotifyConfigured,
  useSpotify,
} from "@/lib/spotify-auth";

/**
 * Plays the room's Spotify track in this browser, on this listener's own
 * Premium account, at this listener's own volume.
 *
 * Each listener is their own Spotify device: the room only agrees on *what* is
 * playing and *where* in the track it is, and every browser drives its own
 * player to match. That keeps the per-person volume promise intact, and means
 * nobody's playback is routed through anyone else's account.
 */

type SpotifyPlayerState = {
  paused: boolean;
  position: number;
  duration: number;
  loading: boolean;
};

type Player = {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, cb: (payload: never) => void) => void;
  getCurrentState: () => Promise<SpotifyPlayerState | null>;
  setVolume: (v: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  activateElement: () => Promise<void>;
};

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume: number;
      }) => Player;
    };
  }
}

const DRIFT_TOLERANCE_MS = 1000;

let sdkPromise: Promise<void> | null = null;
function loadSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve) => {
    if (window.Spotify) return resolve();
    const prev = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js";
    document.head.appendChild(s);
  });
  return sdkPromise;
}

async function playerApi(path: string, body?: unknown) {
  const token = await getAccessToken();
  if (!token) throw new Error("Spotify sign-in expired");
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  // 204 is the happy path; 403 usually means "not Premium".
  if (!res.ok && res.status !== 202) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error?.message ?? `Spotify said ${res.status}`);
  }
}

type Props = {
  trackId: string | null;
  isPlaying: boolean;
  /** Changes whenever the host plays, pauses or skips — forces a re-sync. */
  syncKey: number;
  getTargetMs: () => number;
  volume: number; // 0–100, local only
  onEnded: () => void;
  onToggle?: () => void;
  /** Shown behind the overlays when this listener can't play. */
  artwork?: string;
};

export function SpotifyPlayer({
  trackId,
  isPlaying,
  syncKey,
  getTargetMs,
  volume,
  onEnded,
  onToggle,
  artwork,
}: Props) {
  const spotify = useSpotify();
  const playerRef = useRef<Player | null>(null);
  const deviceRef = useRef<string | null>(null);
  const loadedRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // The SDK callbacks outlive any one render, so they read the live values
  // through refs. This effect is declared first so later effects see them.
  const getTargetRef = useRef(getTargetMs);
  const isPlayingRef = useRef(isPlaying);
  const volumeRef = useRef(volume);
  const onEndedRef = useRef(onEnded);
  const trackRef = useRef(trackId);
  useEffect(() => {
    getTargetRef.current = getTargetMs;
    isPlayingRef.current = isPlaying;
    volumeRef.current = volume;
    onEndedRef.current = onEnded;
    trackRef.current = trackId;
  });

  const canRun = spotify.connected && spotify.canPlay;

  /** Hand the room's track to this browser's device, at the room's position. */
  const startTrack = useCallback(async (id: string, positionMs: number) => {
    const device = deviceRef.current;
    if (!device) return;
    await playerApi(`/me/player/play?device_id=${device}`, {
      uris: [`spotify:track:${id}`],
      position_ms: Math.max(0, Math.floor(positionMs)),
    });
    loadedRef.current = id;
  }, []);

  const sync = useCallback(
    async (force = false) => {
      const p = playerRef.current;
      const id = trackRef.current;
      if (!p || !deviceRef.current || !id) return;
      const target = Math.max(0, getTargetRef.current());

      if (!isPlayingRef.current) {
        const state = await p.getCurrentState();
        if (state && !state.paused) await p.pause();
        return;
      }
      // Nothing loaded yet, or the room moved on: (re)start from the top.
      if (loadedRef.current !== id) {
        await startTrack(id, target);
        return;
      }
      const state = await p.getCurrentState();
      if (!state) {
        await startTrack(id, target);
        return;
      }
      if (state.paused) await p.resume();
      if (force || Math.abs(state.position - target) > DRIFT_TOLERANCE_MS) {
        await p.seek(target);
      }
    },
    [startTrack],
  );

  // Create the player once this listener is actually able to use it.
  useEffect(() => {
    if (!canRun) return;
    let cancelled = false;

    loadSdk().then(() => {
      if (cancelled || !window.Spotify || playerRef.current) return;
      const player = new window.Spotify.Player({
        name: "vibe",
        getOAuthToken: (cb) => {
          void getAccessToken().then((t) => {
            if (t) cb(t);
            else setError("Spotify sign-in expired — connect again.");
          });
        },
        volume: volumeRef.current / 100,
      });
      playerRef.current = player;

      player.addListener("ready", ((payload: { device_id: string }) => {
        deviceRef.current = payload.device_id;
        setReady(true);
        setError(null);
        void sync(true);
      }) as never);
      player.addListener("not_ready", (() => {
        deviceRef.current = null;
        setReady(false);
      }) as never);
      player.addListener("initialization_error", ((e: { message: string }) =>
        setError(`This browser can't run Spotify playback: ${e.message}`)) as never);
      player.addListener("authentication_error", (() =>
        setError("Spotify sign-in expired — connect again.")) as never);
      player.addListener("account_error", (() =>
        setError("Spotify playback needs Premium on this account.")) as never);
      player.addListener("playback_error", ((e: { message: string }) =>
        setError(e.message)) as never);

      // End of track: Spotify reports paused at position 0 with the track still
      // in the window, which is the documented way to notice a finish.
      let wasPlaying = false;
      player.addListener("player_state_changed", ((state: SpotifyPlayerState | null) => {
        if (!state) return;
        if (wasPlaying && state.paused && state.position === 0) {
          wasPlaying = false;
          onEndedRef.current();
          return;
        }
        wasPlaying = !state.paused;
      }) as never);

      void player.connect();
    });

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
      deviceRef.current = null;
      loadedRef.current = null;
      setReady(false);
    };
  }, [canRun, sync]);

  const syncSafely = useCallback(
    (force: boolean) =>
      sync(force).catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Spotify playback failed"),
      ),
    [sync],
  );

  // Follow the room.
  useEffect(() => {
    if (!ready) return;
    void syncSafely(true);
  }, [ready, trackId, isPlaying, syncKey, syncSafely]);

  // Drift correction, same cadence as the YouTube player.
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => void syncSafely(false), 2000);
    return () => clearInterval(t);
  }, [ready, syncSafely]);

  // Local volume.
  useEffect(() => {
    void playerRef.current?.setVolume(Math.max(0, Math.min(1, volume / 100)));
  }, [volume]);

  const overlay = (() => {
    if (!spotifyConfigured)
      return "Spotify isn't configured — set NEXT_PUBLIC_SPOTIFY_CLIENT_ID.";
    if (typeof window !== "undefined" && !hostIsUsable())
      return "Open the app on http://127.0.0.1:3000 — Spotify rejects localhost as a redirect.";
    if (!spotify.connected) return "connect";
    if (!spotify.canPlay)
      return "Spotify only plays in the browser on Premium. This one needs a YouTube link instead.";
    return error;
  })();

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {artwork && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artwork}
          alt=""
          className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-xl"
        />
      )}
      {artwork && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artwork}
          alt=""
          className="absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 rounded-lg object-cover shadow-2xl"
        />
      )}
      {!artwork && !overlay && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Music4 className="size-6" />
        </div>
      )}

      {onToggle && !overlay ? (
        <button
          type="button"
          className="absolute inset-0 cursor-pointer"
          onClick={() => {
            // Mobile browsers only let audio start from a real interaction.
            void playerRef.current?.activateElement();
            onToggle();
          }}
          aria-label={isPlaying ? "pause" : "play"}
        />
      ) : (
        <div className="absolute inset-0" />
      )}

      {overlay === "connect" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center">
          <p className="text-sm font-medium">this track plays through Spotify</p>
          <p className="text-xs text-muted-foreground">
            connect your own Premium account — your volume stays yours
          </p>
          <Button size="sm" onClick={spotify.connect}>
            <Play /> connect spotify
          </Button>
        </div>
      )}

      {overlay && overlay !== "connect" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center">
          <AlertTriangle className="size-6 text-muted-foreground" />
          <p className="max-w-sm text-sm font-medium">{overlay}</p>
          {spotify.connected && (
            <Button size="sm" variant="secondary" onClick={spotify.disconnect}>
              disconnect spotify
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
