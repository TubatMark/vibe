> Historical revision 1 record. The current design and checks are in [revision 2](round2/README.md).

# Music-room redesign research

Reviewed 25 October 2026. The user delegated decisions and requested an anonymous, easy, mobile-friendly music room, dark/light themes, a Stereo-like social feel, and a distinctive background animation.

| Reference | What informed the implementation |
| --- | --- |
| [Stereo](https://stereo.com/) | Social intimacy, people and names close to the shared experience. It is a social audio product, not a source of music playback behavior. |
| [Spotify Jam](https://support.spotify.com/us/article/jam/) | Invite-first shared listening and a clear collaborative queue. |
| [Zoff](https://zoff.me/features/music) | Low-friction room/link/name model without an app account. |
| [Stationhead](https://www.stationhead.com/) | Listening as a gathering, with chat beside music. |
| [Bato — Music App UI, Dark Theme](https://dribbble.com/shots/27347154-Music-App-UI-Dark-Theme) | Deep graphite surfaces, warm orange action color, expressive playback modules. Concept art, not a capability claim. |
| [Lepisov — Music Tech Branding](https://dribbble.com/shots/26278528-Gradient-Music-Tech-Branding-Concept) | Disciplined music identity and typography. |
| [Tipu Rishi — Music app](https://dribbble.com/shots/23381199-Music-app) | Artwork, queue, and listener presence in one listening surface. |

The implementation uses original layout and CSS. Reference products' artwork and interface assets were not copied. Homepage mood imagery is served from Unsplash: photo-1519608487953-e999c86e7455, photo-1470071459604-3b5ec3a7fe05, photo-1441974231531-c6227db76b6e, and photo-1470252649378-9c29740c9fa8. These decorative images were verified to load in the browser and are not advertised as real rooms or playlists.

## Chosen direction

A small listening club: graphite and ivory, copper-orange controls, restrained surfaces, artwork as the main color, and an original animated ribbon of sound-like contours. The room form is usable directly from the homepage. Room moods only prefill the room name. The listening room keeps actual provider playback visible and makes chat, people, and queue accessible as phone tabs. Mobile queue actions use a compact options disclosure.

## Playback boundary

App identity is anonymous and local to the browser. Joining requires only a chosen name. The existing optional [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk) still requires the listener's Spotify Premium authorization. Spotify is not configured in the checked-in local environment. YouTube remains the account-free listening route. The app does not bypass provider restrictions.

## Preserved work

Existing uncommitted backend and Spotify integration changes were present before this task and were preserved. The pre-redesign source snapshot and tracked WIP patch are in `/private/tmp/vibe-redesign-before/`. No credentials, external service setup, database schema, or deployment were changed by the redesign.

## Existing backend concern

The audit found existing host checks trust a browser-supplied user ID; that is not a strong security boundary against a determined guest. This redesign preserves those backend semantics. Server-issued guest sessions/host capabilities should be addressed before treating rooms as access-controlled spaces. Clearing browser storage also loses the existing host identity because host handoff is not implemented.
