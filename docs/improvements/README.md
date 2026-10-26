# Usability and reliability improvements

25 October 2026. This pass preserves the revision 2 identity and improves the anonymous listening flow. No external services were provisioned, credentials changed, backend code deployed, or existing records deleted. The prior source and WIP patch are preserved in `/private/tmp/vibe-improvements-before/`.

## Implemented

- **Reliable invites:** an accessible disclosure shows a canonical room link and a copyable room code. Clipboard denial selects the field and explains manual copying. Native sharing appears where supported. Escape closes the disclosure and restores its trigger focus.
- **Phone navigation:** a persistent bottom bar makes Player, Queue, Chat, and People available without searching below the player. Selecting a section scrolls to it. Safe-area spacing keeps content and motion controls clear of the bar. Provider embeds retain a minimum 200px height on narrow screens.
- **Safer chat:** sending is awaited; pending sends cannot duplicate. Failed sends retain the draft and explain retry. Edits made while sending are preserved. New messages no longer force someone away from earlier history. Unread badges use actual viewport/document visibility, rather than treating off-screen chat as read.
- **Connection feedback:** the actual Convex socket and browser online state drive a visible connecting/offline/reconnecting notice. Interactive room changes wait for connectivity; automatic track completion can still queue through a disconnect. Drafts remain in the current page. Server rendering does not open a socket for this notice.
- **Recoverable YouTube playback:** failed/blocked API scripts time out with a working retry. Blocked autoplay exposes a local Start listening button. An initially paused track remains cued. Delayed resync timers are cleaned up on departure.
- **Stable anonymous identity:** when localStorage fails, identity, confirmation and preferences remain stable in page-session memory. Writes can recover when storage becomes available. Normal cross-tab changes still propagate. Corrupt saved volume falls back to a finite 0–100 value.
- **Keyboard continuity:** closing a phone track menu or saving/canceling a name edit restores focus to its trigger.
- **LAN development:** the current machine’s IPv4 interface addresses are allowed for Next development assets. This fixes blocked scripts/fonts when opening the dev preview from a phone, without allowing arbitrary origins.

## Research and implementation evidence

The [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference) documents autoplay blocking, cued-player seek behavior, and embed size requirements. [MDN Clipboard](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText) and [Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share) document secure-context and user-gesture requirements, motivating visible manual fallbacks. Convex connection APIs were checked against the installed 1.47 client source and current official documentation via Context7. Installed Next.js 16.4.2 error/CSS/development-origin documentation was consulted.

## Validation

Final commands after the UI changes:

```sh
node --test scripts/local-store.test.mjs scripts/check-youtube-player.mjs scripts/check-room-behavior.mjs
pnpm lint
pnpm build
git diff --check
```

All **18 regression tests passed**; lint, production build (including TypeScript and prerendering), and whitespace checks completed with exit code 0. Tests execute production TypeScript in controlled browser/provider fixtures; they do not claim real provider playback or physical-device performance. The five original player regressions were reproduced against the prior code before their fixes. The mechanical design detector returned no findings in the changed UI targets.

Live browser observations used a newly created test room `/r/r3wagu`, “Better together.” Anonymous create/join and a successful chat send were exercised. Separate localhost/LAN identities showed two listeners and an unread badge for an incoming message while the recipient was at the player. At 320px there was no horizontal overflow, the provider viewport was 200px high, and the section bar stayed at the viewport bottom. The LAN HTTP invite correctly removed query/hash fragments; clipboard was unavailable, and its manual-copy fallback selected the full link. Escape returned focus to Invite friends.

The final production preview was restarted on port 3001. Its phone invite disclosure showed successful clipboard feedback in a secure localhost context, and its dark chat view retained the persistent navigation. Native Share was present in the supported browser, but the OS share sheet was not invoked. The final room and LAN home browser logs had no errors/warnings in the inspected session. The LAN home was left open for review. Saved captures: [light invite](screenshots/invite-mobile-light.png), [dark chat](screenshots/chat-mobile-dark.png).

The browser tool’s full network-offline emulation stalled behind a before-unload dialog, so a complete real disconnect/reconnect browser cycle is **not claimed**. Draft failure, hidden-chat unread behavior, and offline track completion are covered by the regression fixtures. Native OS sharing, physical phones, Safari, measured synchronization drift, and Spotify playback were not tested.

## Review and remaining scope

Independent source review found two regressions during implementation: losing automatic track-end events when offline, and reading messages while chat was below the viewport. Both were corrected and added to the passing room regression harness. A screenshot pass also caught the room motion control overlapping the new phone bar; its stacking and safe-area spacing were corrected.

Existing backend/Spotify WIP remains intact. A later backend release should replace the cached `serverNow` query value with fresh clock samples: [Convex warns that Date.now in a cached query can be stale](https://docs.convex.dev/understanding/best-practices#dont-use-datenow-in-queries). Existing host authorization still trusts browser-supplied identity; this pass does not claim production security hardening. The optional, unconfigured Spotify integration also retains its own SDK-loading/secure-context limitations. These need a separate backend/provider release and verification, not an untested frontend workaround.
