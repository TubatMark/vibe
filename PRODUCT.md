# vibe

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Friends create a listening room, share its link, and listen to the same track together. The user explicitly requested an anonymous experience with chosen display names, no app sign-in, and a complete contemporary redesign inspired by music products such as Stereo. They delegated design and implementation decisions and asked for no questions.

## Capabilities and constraints

- Existing Next.js App Router, React, Convex, Tailwind and Lucide implementation.
- Anonymous browser identity and a display name, create/join rooms, shared playback, host controls, a queue, host-approved requests, presence, chat, and local volume.
- YouTube plays using its embedded player. Spotify playback uses the existing optional integration and requires the listener's Spotify Premium authorization; app membership never requires an account.
- A configured Convex backend drives shared rooms. Without it, a clearly labeled browser-only preview exists; preview participants and messages are illustrative.
- Preserve existing uncommitted Spotify/backend work. Do not alter credentials, provision services, publish or deploy as part of this redesign.

## Product principles

- Make the first action obvious: choose a name and start or join a room.
- Keep the music and the people close, with a shared queue and conversation.
- State playback and connection limitations honestly.
- Support narrow screens, keyboard use, reduced motion, and light/dark preferences.

## Evidence

Repository README, source adapters, playback components, and the user's brief. Online visual research is documented separately. No audience counts, testimonials, or public rooms are available and none should be fabricated.
