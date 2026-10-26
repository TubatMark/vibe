# vibe design guide — revision 2

Implemented 25 October 2026, Asia/Manila. This revision replaces the first redesign’s photo-led, copper-orange soundboard with a **graphic independent listening room**: paper, ink, cobalt, lilac, expressive lettering, and a moving optical duet. The user delegated the design decisions and then asked for a more intentional identity, a generated logo, and engaging motion.

The design is a considered direction, not a claim of objective “best” design or uniqueness. [Revision 2 research, screenshots, and verification](docs/design/round2/README.md) records its evidence. The previous guide is preserved at `/private/tmp/vibe-round2-before/DESIGN.md`; the original [research](docs/design/RESEARCH.md) and [validation](docs/design/VALIDATION.md) describe revision 1 and remain historical evidence.

## Source of truth

| Area | Implementation |
| --- | --- |
| Themes, home layout, name gate, shared primitives | `src/app/globals.css` |
| Self-hosted fonts, saved theme before hydration, backdrop | `src/app/layout.tsx` |
| Create/join form and invitation copy | `src/app/page.tsx` |
| Wordmark, theme toggle, anonymous name gate, avatars | `src/components/app-chrome.tsx` |
| Optical duet, remix, and motion controls | `src/components/sonic-stage.tsx`, `sonic-stage.css` |
| Shared background rings and room motion control | `src/components/ambient-backdrop.tsx`, `ambient-backdrop.css` |
| Actual provider player, queue, and social panels | `src/app/r/[slug]/room.tsx`, `room.css` |
| Generated identity assets | `public/brand/vibe-wordmark.png`, `vibe-symbol.png` |

## Color and surfaces

Light is the default. The saved light/dark choice persists in `vibe:theme`. Use the shared variables across routes.

| Token | Light | Dark |
| --- | --- | --- |
| `--background` | `#f7f7f2` | `#151824` |
| `--foreground` | `#1c2331` | `#f6f6f1` |
| `--card` | `#ffffff` | `#1e2230` |
| `--vibe-surface` / `--secondary` | `#eaeaf1` | `#292e40` |
| `--muted-foreground` | `#626471` | `#b2b6c6` |
| `--border` | `#d9dbe4` | `#3b4156` |
| `--vibe-accent` / `--primary` | `#3f4ee8` | `#b8b7fa` |
| `--vibe-accent-ink` | `#ffffff` | `#1c2331` |
| `--ring` | `#3f4ee8` | `#c5baf4` |
| `--vibe-soft-accent` | `#ecebff` | `#30314c` |
| `--poster` | `#e2def4` | `#bfc0e4` |

The poster stays a deliberate light print surface in both themes. Controls use flat color, crisp rules, and modest corners: 5–6px for home forms and 8–10px for room panels. The room uses a flat numbered queue instead of a grid of ornamental cards. Keep provider artwork inside the actual room; there are no homepage stock photos or mood-card images.

## Typography and identity

Bricolage Grotesque supplies display headings through `--font-display`. Its variable font is locally self-hosted from `public/fonts/BricolageGrotesque-variable.ttf`, sourced from the official Google Fonts distribution. Preserve `public/fonts/BricolageGrotesque-OFL.txt` with it. Geist remains the interface/body family, with Geist Mono for compact codes and numeric labels; both load through the existing `next/font` setup.

The homepage pairs the large “Pass the aux.” phrase with a direct invitation and a real form. Display typography also carries the room, track, section, and name-gate headings. Keep readable interface text and visible form labels.

The generated, bespoke black wordmark is a transparent PNG, displayed at 124px on desktop, 102px on mobile, and 110px in the room header. Dark mode inverts the wordmark. A matching transparent V symbol is provided in `public/brand/` for compact identity use. The wordmark is the current header identity; do not reinstate the previous orange audio-lines icon. Exact generation prompts and asset provenance are maintained with the brand assets.

## Layout and use

Desktop home uses a lilac graphic poster beside the create/join form. The form asks for a chosen name, then an optional room name or an invite link/code. Keep errors, busy states, keyboard-operable tabs, and the account-free/Spotify explanation visible. “First time here?” reveals concise instructions.

On phones, the short title leads into the full-width entry form, followed by the optional animated artwork. The animation never blocks entry. At 760px and below, room content becomes one column. A persistent bottom bar switches between Player, Queue, Chat, and People; the current section is visible without searching below the player. Keep safe-area spacing, 44px touch controls, 16px phone inputs, wrapping metadata, and labelled queue-options disclosures.

The room keeps the actual music object prominent, with a quiet social column on desktop. Preserve the live/demo adapters, host playback and moderation controls, approval requests, local volume, chat, people list, and explicit name editing. Anonymous identity persists locally; it does not create an app account.

## Motion

`SonicStage` draws two concentric record forms labelled “you” and “your people.” Flat print palettes, drifting ellipses, and spring-based pointer response create the optical duet. Touch interaction keeps vertical scrolling available. “Remix the shape” cycles the palette and arrangement, including while motion is paused. This is decorative code animation, **not audio analysis or an audio-reactive visualizer**.

The canvas caps drawing at 30fps and device pixel ratio at 2.5, pauses outside the viewport or when the tab is hidden, and removes observers/listeners/frames on unmount. Reduced motion freezes it and disables the motion toggle; remix still changes the static artwork.

Four low-opacity outline rings form the shared `AmbientBackdrop`. Slow 24–33 second transform loops connect home and room without competing with controls. The backdrop ignores pointer input and pauses in hidden tabs. It shares `vibe:atmosphere-paused` with SonicStage. Home uses the stage’s Pause/Resume control; rooms have a separate background control using the same preference. Reduced-motion settings stop background motion and hide its redundant room control.

## Verification and boundaries

The parent agent reports passing `pnpm lint` and `pnpm build` after the font and backdrop changes. Browser observations for this revision cover light/dark home and room, home widths 320/390/768/1440px without horizontal overflow, a clear 390px room, animation movement, pause, remix while paused, and the shared backdrop pause state. See [revision 2 evidence](docs/design/round2/README.md).

**Final checks: passed.** `pnpm lint`, `pnpm build` (TypeScript and prerendering), and `git diff --check` completed with exit code 0 after the final UI changes. The local production preview was restarted on port 3001 and inspected: current logo, loaded display font, both themes, moving canvas, no home console warnings/errors, and correct content/background layering. Independent [finish review](docs/design/round2/REVIEW.md) passed the visual direction with no material fixes remaining. At 390px, the parent agent also exercised the demo guest’s chat and People tabs; these are browser observations, not a physical-phone test.

The backend, schemas, provider adapters, and existing data remain outside this visual revision. Revision 1’s two-browser shared-state verification is historical evidence for preserved flows; it was not rerun in this round. No new Spotify playback or physical-phone validation is claimed. YouTube remains the account-free route; optional Spotify playback requires a connected Premium account. Existing backend trust and recovery limitations remain in the original research.

## Subsequent usability pass

The [usability and reliability record](docs/improvements/README.md) documents later improvements: canonical link/code invites with manual-copy fallback, persistent phone navigation, viewport-aware unread chat, safe drafts and mutation feedback, real socket connection notices, recoverable YouTube loading/autoplay, and stable page-session identity when storage is blocked. Keep the shared motion control above the phone navigation safe area. The revision 2 screenshot/review records above remain historical; current validation is recorded with this later pass.
