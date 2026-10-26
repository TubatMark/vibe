import { isSpotifyId, isYouTubeId } from "./trackId";
import type { Track } from "./schema";

/**
 * Everything these helpers touch arrives from a browser. A client can call any
 * mutation directly with any payload the argument validators allow, so the
 * resolver actions are a convenience, never a guarantee about what gets stored.
 */

export const MAX_DISPLAY_NAME = 24;
export const MAX_ROOM_NAME = 60;
export const MAX_MESSAGE = 500;
const MAX_TITLE = 200;
const MAX_AUTHOR = 120;

/** Collapse whitespace, cap the length, fall back when nothing is left. */
export function cleanText(value: string, max: number, fallback: string) {
  const text = value.replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}

export const cleanDisplayName = (value: string) =>
  cleanText(value, MAX_DISPLAY_NAME, "guest");

export const cleanRoomName = (value: string) =>
  cleanText(value, MAX_ROOM_NAME, "untitled room");

/**
 * Artwork ends up in an `<img src>` in every listener's browser, so an
 * arbitrary URL here would be a tracking beacon for the whole room. Only the
 * two providers' own image CDNs are accepted; anything else loses its artwork.
 */
function cleanThumbnail(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  if (url.protocol !== "https:") return "";
  const host = url.hostname;
  const allowed =
    host === "i.ytimg.com" ||
    host === "img.youtube.com" ||
    host === "scdn.co" ||
    host.endsWith(".scdn.co") ||
    host.endsWith(".spotifycdn.com");
  return allowed ? url.toString() : "";
}

/** A track as the room will store it: provider id checked, text capped. */
export function cleanTrack(track: Track): Track {
  const source = track.source ?? "youtube";
  const idFits = source === "spotify" ? isSpotifyId(track.videoId) : isYouTubeId(track.videoId);
  if (!idFits) throw new Error("That track id doesn't match its source");
  return {
    videoId: track.videoId,
    title: cleanText(track.title, MAX_TITLE, "untitled track"),
    author: cleanText(track.author, MAX_AUTHOR, "unknown"),
    thumbnail: cleanThumbnail(track.thumbnail),
    source,
  };
}
