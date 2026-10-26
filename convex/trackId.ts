/**
 * Provider id parsing, shared by the Convex functions and the browser so both
 * sides agree on what counts as a track id. Pure: no Convex or DOM imports.
 */

export type Source = "youtube" | "spotify";

const YOUTUBE_ID = /^[\w-]{11}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

export const isYouTubeId = (value: string) => YOUTUBE_ID.test(value);
export const isSpotifyId = (value: string) => SPOTIFY_ID.test(value);

/** `endsWith("youtube.com")` also matches notyoutube.com, so compare labels. */
function isHost(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function webUrl(input: string) {
  try {
    const url = new URL(input);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function extractYouTubeId(input: string): string | null {
  const s = input.trim();
  if (YOUTUBE_ID.test(s)) return s;
  const url = webUrl(s);
  if (!url) return null;
  if (isHost(url.hostname, "youtu.be")) {
    const short = url.pathname.match(/^\/([\w-]{11})(?:\/|$)/);
    return short ? short[1] : null;
  }
  if (isHost(url.hostname, "youtube.com") || isHost(url.hostname, "youtube-nocookie.com")) {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v") ?? "";
      return YOUTUBE_ID.test(id) ? id : null;
    }
    const path = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})(?:\/|$)/);
    if (path) return path[1];
  }
  return null;
}

/** Links and URIs only: a bare 22-character string is too ambiguous to guess. */
export function extractSpotifyTrackId(input: string): string | null {
  const s = input.trim();
  const uri = s.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (uri) return uri[1];
  const url = webUrl(s);
  if (!url || !isHost(url.hostname, "spotify.com")) return null;
  const path = url.pathname.match(/\/track\/([A-Za-z0-9]{22})(?:\/|$)/);
  return path ? path[1] : null;
}

/**
 * A bare 11-character id is YouTube's shape, but only links are unambiguous for
 * Spotify, so anything else stays null and the caller says what it accepts.
 */
export function detectSource(input: string): Source | null {
  if (extractSpotifyTrackId(input)) return "spotify";
  if (extractYouTubeId(input)) return "youtube";
  return null;
}
