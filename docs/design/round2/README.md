# Revision 2 — graphic listening room

25 October 2026, Asia/Manila. This revision responds to the user’s concern that the previous photos, mood cards, and generic dashboard treatment felt generated. The new direction removes those homepage images and unnecessary card sections, builds the invitation around lettering and a real room form, and gives the product one coherent graphic motif. It is a design judgment, not a claim of objective superiority or uniqueness.

The current system is documented in [DESIGN.md](../../../DESIGN.md). Revision 1 remains in [RESEARCH.md](../RESEARCH.md) and [VALIDATION.md](../VALIDATION.md); its old design guide is preserved at `/private/tmp/vibe-round2-before/DESIGN.md`.

## Fresh reference findings

These sources informed principles, not copied layouts or borrowed assets. Research included Pinterest and Dribbble as requested, plus real music products and primary designer case studies.

| Source | Finding and use | Evidence limit |
| --- | --- | --- |
| [Hedroom — David McGillivray](https://dmcg.co/work/hedroom) | A restrained environment lets interactive music objects and precise hardware-inspired controls carry the identity. This informed one central optical object rather than many decorative cards. | Primary case study and live screenshot inspected; its full media embeds were unavailable. |
| [FONO](https://fono-player.app/) | Anonymous invite-code rooms, decisive typography, and a clear queue map closely to this product. It reinforced direct functional copy and music-first hierarchy. | Primary site and screenshot inspected; its product capabilities were not independently tested. |
| [NTS](https://www.nts.live/) | Crisp rules, clear broadcast status, and editorial confidence communicate music culture. This informed compact status labels and flat queue rows. | Live screenshot inspected; do not reproduce its dense homepage. |
| [Teenage Engineering OB–4](https://teenage.engineering/products/ob-4) | A small set of tactile controls can invite play without making the interface complicated. This informed the contained player and control feedback. | Primary product site and screenshot inspected. |
| [BBC Radio concept on Pinterest](https://in.pinterest.com/pin/96545985738646205/) — [Alexey Yurkov’s original](https://www.behance.net/gallery/24084945/BBC-RADIO-Website-Redesign-) | Sparse white space, a narrow cobalt region, and direct player controls supported the paper/ink/cobalt palette. | Screenshot and attribution inspected. This is an older concept, not evidence of a latest trend. |
| [Music Festival Website Animation & Interaction — tubik, Dribbble](https://dribbble.com/shots/27418434-Music-Festival-Website-Animation-Interaction) | The designer describes record-like orbiting movement with a consistent musical rhythm. This informed a coherent moving motif. | Primary description verified; media remained loading, so the complete animation was not visually inspected. |

A [Pinterest music-hero illustration](https://id.pinterest.com/pin/540502392796167775/) was also inspected and rejected: its generic two-column illustrated app landing page would repeat the problem rather than improve the identity.

## What changed

- Paper and ink in light mode; deep blue-black and lilac in dark mode. Cobalt replaces copper-orange.
- Bricolage Grotesque display headings, locally self-hosted with the official OFL retained in `public/fonts/`; Geist remains the readable body/interface face.
- Generated transparent PNG wordmark and matching V symbol in `public/brand/`. The current header uses the wordmark, inverted for dark mode. Generation prompts/provenance are saved with the brand assets.
- No homepage stock photos or mood cards. The room retains actual provider artwork and players.
- A coded optical duet with Remix and Pause/Resume; quiet background rings share its pause preference. The motion is decorative, not audio-reactive.
- Phone entry comes before artwork. Existing 44px phone controls, 16px inputs, room tabs, queue disclosures, independent volume, and anonymous naming remain.

## Current screenshots

These are point-in-time captures of this revision, not proof of a physical phone test.

| View | Desktop | Phone viewport |
| --- | --- | --- |
| Home, light | [Screenshot](screenshots/home-light-desktop.jpg) | [Screenshot](screenshots/home-light-mobile.jpg) |
| Home, dark | [Screenshot](screenshots/home-dark-desktop.jpg) | [Screenshot](screenshots/home-dark-mobile.jpg) |
| Room, light | [Screenshot](screenshots/room-light-desktop.jpg) | [Screenshot](screenshots/room-light-mobile.jpg) |
| Room, dark | [Screenshot](screenshots/room-dark-desktop.jpg) | [Screenshot](screenshots/room-dark-mobile.jpg) |

Additional captures: [phone guest](screenshots/room-guest-light-mobile.jpg), [final local production home](screenshots/production-home-light-desktop.jpg). [Logo assets and exact generation prompts](../../../public/brand/README.md).

## Checks and remaining scope

| Check | Current evidence |
| --- | --- |
| Lint and production build | Final `pnpm lint`, `pnpm build` (including TypeScript and prerendering), and `git diff --check` completed with exit code 0 after the final UI changes. |
| Responsive home | Parent observed widths 320, 390, 768, and 1440px without horizontal overflow. |
| Responsive room | Parent inspected 390px host and guest views without horizontal overflow. Visible main buttons and queue disclosures were at least 44px; guest Chat accepted a message and People showed listeners. This exercised the local demo, not a new backend synchronization test. |
| Animation behavior | Parent observed artwork changing during motion, freezing while paused, and changing on Remix while paused. |
| Shared motion preference | Parent verified the background’s paused attribute follows the shared control state. Source also handles reduced motion and hidden tabs. |
| Local production preview | Restarted on port 3001. Browser confirmed current logo and display font, dark/light themes, moving canvas, no home console errors/warnings, and content above the backdrop. At 390px the form has 16px inputs and no horizontal overflow. |
| Independent review | [Pass on visual direction](REVIEW.md), with no material fixes remaining. Source/screenshot review is distinguished from parent-observed runtime evidence. |

This round changes presentation, identity assets, fonts, and motion. Backend schemas, provider adapters, and existing data were left intact. The earlier two-browser live test is documented in revision 1 and was not repeated this round; do not relabel it as a new revision 2 result. This revision does not claim new Spotify playback validation, measured playback synchronization, a physical-phone test, production security validation, or deployment.
