"use client";
import { useCallback } from "react";
import { readLocal, useLocalValue, writeLocal } from "./local-store";

/**
 * Spotify sign-in with Authorization Code + PKCE, run entirely in the browser.
 *
 * PKCE is what Spotify recommends when there's no secure place for a client
 * secret, which is the case here: the room is a static page and the only thing
 * these tokens can do is drive this listener's own playback.
 *
 * Two Spotify rules shape this file:
 * - Refresh tokens expire six months after the original authorization (and
 *   refreshing doesn't extend that). An expired one comes back as 400
 *   invalid_grant, which means: throw it away and send the person through
 *   sign-in again. https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration
 * - Redirect URIs must be HTTPS or a literal loopback address, so local dev
 *   has to run on http://127.0.0.1:3000 — `localhost` is rejected.
 *   https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
 */

const KEY = "vibe:spotify";
const VERIFIER_KEY = "vibe:spotify:verifier";
const STATE_KEY = "vibe:spotify:state";
const RETURN_KEY = "vibe:spotify:return";

const AUTHORIZE = "https://accounts.spotify.com/authorize";
const TOKEN = "https://accounts.spotify.com/api/token";

/**
 * `streaming` is what the Web Playback SDK runs on (Premium only); the two
 * user-read scopes are its prerequisites; the player scopes let us hand the
 * room's track to this browser's device.
 */
const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ");

export const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
export const spotifyConfigured = clientId.length > 0;

export type SpotifyProfile = {
  id: string;
  name: string;
  /** "premium" | "free" | "open" — playback needs "premium". */
  product: string;
};

type Session = {
  accessToken: string;
  refreshToken: string;
  /** ms epoch when the access token stops working. */
  expiresAt: number;
  /** ms epoch of the original authorization: the six-month clock. */
  authorizedAt: number;
  profile: SpotifyProfile;
};

/**
 * Browser storage outlives any one version of this file, so a session written
 * by an older build — or edited by hand — must not take the room down with it.
 */
function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Session> | null;
    if (!value?.accessToken || !value.refreshToken || !value.profile) return null;
    return value as Session;
  } catch {
    return null;
  }
}

function readSession(): Session | null {
  return parseSession(readLocal(KEY));
}

function writeSession(s: Session | null) {
  if (s) writeLocal(KEY, JSON.stringify(s));
  else writeLocal(KEY, "");
}

export function redirectUri() {
  return `${window.location.origin}/spotify/callback`;
}

/** Spotify rejects `localhost`, so say so before the redirect bounces. */
export function hostIsUsable() {
  return window.location.hostname !== "localhost";
}

function randomString(bytes = 64) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => ("0" + b.toString(16)).slice(-2)).join("");
}

async function challenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Sends the browser to Spotify. Comes back at /spotify/callback. */
export async function beginAuth(returnTo: string) {
  const verifier = randomString();
  const state = randomString(16);
  writeLocal(VERIFIER_KEY, verifier);
  writeLocal(STATE_KEY, state);
  writeLocal(RETURN_KEY, returnTo);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: await challenge(verifier),
    state,
    scope: SCOPES,
  });
  // Leaving the app entirely for accounts.spotify.com, so this is a full
  // navigation, not a route change.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `${AUTHORIZE}?${params}`;
}

/** Runs on the callback page. Returns where to send the listener next. */
export async function completeAuth(code: string, state: string) {
  const expected = readLocal(STATE_KEY);
  const verifier = readLocal(VERIFIER_KEY);
  if (!expected || state !== expected) throw new Error("Sign-in state didn't match");
  if (!verifier) throw new Error("Sign-in started in another browser");

  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? "Spotify refused the sign-in");

  const now = Date.now();
  const profile = await fetchProfile(data.access_token);
  writeSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: now + data.expires_in * 1000,
    authorizedAt: now,
    profile,
  });
  writeLocal(VERIFIER_KEY, "");
  writeLocal(STATE_KEY, "");
  return readLocal(RETURN_KEY) || "/";
}

async function fetchProfile(accessToken: string): Promise<SpotifyProfile> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Couldn't read your Spotify profile");
  const me = (await res.json()) as {
    id: string;
    display_name: string | null;
    product: string;
  };
  return { id: me.id, name: me.display_name ?? me.id, product: me.product };
}

export function disconnect() {
  writeSession(null);
}

/**
 * A usable access token, refreshing when it's nearly out. Returns null when
 * nobody is signed in, or when the refresh token has lapsed — in which case the
 * session is cleared so the UI falls back to the connect button.
 */
export async function getAccessToken(): Promise<string | null> {
  const s = readSession();
  if (!s) return null;
  if (s.expiresAt > Date.now() + 60_000) return s.accessToken;

  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: s.refreshToken,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant means the six months are up: there's nothing to retry.
    if (data?.error === "invalid_grant") disconnect();
    return null;
  }
  writeSession({
    ...s,
    accessToken: data.access_token,
    // Spotify may or may not hand back a new refresh token.
    refreshToken: data.refresh_token ?? s.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token as string;
}

export type SpotifyConnection = {
  configured: boolean;
  connected: boolean;
  profile: SpotifyProfile | null;
  /** Premium is a hard requirement for playback in the browser. */
  canPlay: boolean;
  connect: () => void;
  disconnect: () => void;
};

export function useSpotify(): SpotifyConnection {
  const [raw, setRaw] = useLocalValue(KEY);
  const session = parseSession(raw);

  const connect = useCallback(() => {
    void beginAuth(window.location.pathname + window.location.search);
  }, []);

  return {
    configured: spotifyConfigured,
    connected: !!session,
    profile: session?.profile ?? null,
    canPlay: session?.profile?.product === "premium",
    connect,
    disconnect: () => setRaw(""),
  };
}
