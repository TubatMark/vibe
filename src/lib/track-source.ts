/**
 * Which service a pasted link belongs to, so the room can hold both.
 *
 * The parsing itself lives next to the Convex functions that re-check it, so
 * the browser and the server can never drift on what a track id is.
 */
export {
  detectSource,
  extractSpotifyTrackId,
  extractYouTubeId,
  isSpotifyId,
  isYouTubeId,
} from "../../convex/trackId";
export type { Source } from "../../convex/trackId";
