# vibe

Listen to music together. Everyone in a room hears the same YouTube track in sync —
but **volume is per-person**, so you can turn yours down to talk while everyone
else keeps it loud.

- Create a room, share the link. No sign-up (anonymous guest identity in localStorage).
- Host controls play / pause / skip / reorder.
- Two modes: **open** (anyone adds to the queue) or **approval** (requests go to the host).
- Live presence, chat, auto-advance when a track ends.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Convex · Tailwind v4 · shadcn-style UI (radix-ui) · YouTube IFrame API

## Run it

```bash
pnpm install            # re-link native binaries for macOS
npx convex dev          # creates the Convex project, writes .env.local, regenerates convex/_generated
pnpm dev                # http://localhost:3000
```

Open two browser windows (or a phone) on the same room link to see sync + independent volume.

## How sync works

The room stores `startedAt` (server time when the track was at 0:00) and `isPlaying`.
Each client reads `serverNow` from the room query to estimate clock offset, computes
`elapsed = now + offset - startedAt`, and re-seeks the YouTube player when drift > 1s.
Play/pause/seek by the host update `startedAt`/`pausedAt`, which Convex pushes to everyone.

## Layout

```
convex/          schema + rooms / queue / requests / presence / messages / youtube (oEmbed resolver)
src/app/         landing page, /r/[slug] room
src/components/  youtube-player.tsx (sync wrapper), ui/* (shadcn-style primitives)
src/lib/         local-store (useSyncExternalStore over localStorage), user, volume
```

`components.json` is set up so `pnpm dlx shadcn@latest add <component>` works.

## Ideas / next

- YouTube search (needs a Data API key) instead of paste-a-link
- Spotify via Web Playback SDK (Premium-only listeners)
- Skip votes, room passcodes, host handoff
