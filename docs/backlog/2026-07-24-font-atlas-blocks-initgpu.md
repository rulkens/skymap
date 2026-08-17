# Font atlas load blocks initGpu

## The problem

`initGpu` awaits the label font atlas before building any of the renderers
and catalog fetches that follow it, so every cold boot pays a strictly
serial head-of-line delay before any other asset fetch begins.

## Verified current state

- `src/services/gpu/labelLayout/loadFontAtlases.ts` fetches
  `/fonts/cormorant.json` (86,964 B) and `/fonts/cormorant.webp` (209,988 B)
  in parallel per font (lines 70-81) — together ~297 KB.
- No retry: if either fetch fails, `loadFontAtlases` rejects and the
  bootstrap catch block dispatches `engineStatusChanged({ kind: 'error' })`
  (documented in the file's own header, lines 35-45).
- `src/services/engine/phases/initGpu.ts` awaits `loadFontAtlases()` at
  line 216. Everything constructed after that line in `initGpu` blocks on
  it: the label/marker-line/debug-line/selection-ring/structure-marker/
  Milky-Way-pick renderers built immediately after (lines 226-270), the
  `GALAXY_CATALOG_SOURCE_REGISTRY` fetch loop that kicks off the big
  per-catalog `.bin` downloads (line 302), and every renderer built further
  down (star, planet, body, ring, atmosphere, etc.).

## Fix

Make label/MSDF rendering tolerate a missing font atlas so `initGpu` does
not await it: kick off `loadFontAtlases()` without blocking, let the rest
of `initGpu` proceed immediately, and have the label renderer render
nothing (or resolve once the atlas lands) until the fetch completes.

## Cost to note

Teaches the text/MSDF layer a "no atlas yet" state — a subsystem this
change otherwise does not touch.

## Sequencing

Deliberately scoped OUT of the boot load-priority scheduler work
(`docs/grill-sessions/boot-load-priority-2026-07-24.md`, Q16): ~300 KB is
small beside the ~101.7 MB of boot fetches that work targets, and folding
this in would widen that feature's blast radius into the label/MSDF
subsystem.
