# vibe identity assets

Generated on 25 October 2026 using Codex's built-in image generation tool (`image_gen.imagegen`). These are raster PNG assets with transparent backgrounds, not vector originals. The website displays the wordmark through Next Image; dark mode inverts its black ink. The app icon embeds the matching V symbol in a lilac SVG wrapper.

| Asset | Purpose |
| --- | --- |
| [vibe-wordmark.png](vibe-wordmark.png) | Final 2001 × 786 transparent horizontal wordmark |
| [vibe-symbol.png](vibe-symbol.png) | Final 1254 × 1254 transparent V symbol, extracted by image generation from the wordmark |
| [icon.svg](../../src/app/icon.svg) | App icon wrapper, centering the symbol's visible bounds on a lilac square |

## Wordmark prompt

The first generation used `transparent_background: true` and no reference images, with this exact prompt:

> Use case: logo-brand. Create one final, exceptional bespoke wordmark logo for an anonymous social music listening website named exactly 'vibe' (lowercase v i b e). Transparent background. Pure solid black ink only, no other colors. A custom drawn, exuberant but highly legible, extra-bold softly rounded geometric wordmark with a subtle forward rhythm, low wide letterforms, optical kerning, a generous square-rounded i dot, and distinctive subtly notched v terminals. Think a serious independent music identity, warm and human, playful precision rather than a standard font. All four letters must read instantly at small sizes; no ambiguity with 'vivo', 'vide' or 'vile'. The v leans slightly, b has a strong upright and circular counter, e has an open aperture. Design as a flat vector-style silhouette with crisp controlled edges; no thin lines. Only ONE horizontal wordmark centered tightly, fill most of the image width, with modest transparent margins. No icon next to it, no circle badge, no musical note, no headphones, no soundwave/equalizer glyph, no tagline, no mockup, no texture, no gradient, no bevel, no shadows. Deliver the actual usable logo, not a presentation board. Original design, do not copy any existing brand.

## Symbol prompt

The second generation used the final wordmark as its reference image and `transparent_background: true`, with this exact edit prompt:

> Use case: logo-brand. This is an exact logo asset extraction, not a new logo. Use the attached vibe wordmark as the edit target. Keep ONLY its first lowercase letter 'v', preserving its exact existing distinctive soft chunky silhouette, top terminal notches and rounded low point. Remove the letters i b e completely. Center that same black v on a square transparent canvas with 12 percent clear space on each side. Pure black symbol only. No background, no added outlines, no new motif, no rounded square tile, no shadows, no texture, no tagline. This is the small app-icon/fav-icon version of this existing brand, so matching the first letter faithfully is the only goal.

## Use in the application

The generated PNGs were copied without pixel editing. The symbol's SVG wrapper uses a viewBox adjusted to its visible alpha bounds so the icon appears centered. The homepage artwork and background rings are coded animation; they are separate from these generated logo assets. Provider artwork inside rooms belongs to the actual YouTube/Spotify tracks.
