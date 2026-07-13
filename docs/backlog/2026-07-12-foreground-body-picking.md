# Foreground-body picking (Sun / Earth / planets / local stars)

**Status:** ready — HIGH PRIORITY (user-flagged 2026-07-12)
**Area:** Rendering / selection

## Problem

The NEAR0 foreground bodies (Sun, Earth, planets, the 24 local stars) are not
click/hover-pickable: the pick pass draws only COSMO-slab pickable layers, so
the cursor passes straight through an on-screen Earth to whatever galaxy sits
behind it. Bodies are reachable today only via the palette body search
(zoom-to-earth plan 02 task 7b) and the fly-to-Earth 'e' key.

## Why this is `ready` — the seams already exist

Almost all of the machinery was built anticipating exactly this:

- `pickProgram` (`src/services/engine/frame/pickProgram.ts`) is **per-slab**:
  it groups pickable layers by slab, rasterises each slab's pick geometry into
  its own r32uint texture, reads one texel per slab, and folds them near→far
  on the CPU (the cross-slab occlusion rule is a pure fold, not a GPU
  composite). Its docblock states the near-field slab "hosts no pickable layer
  **today**, so `pick:near0` is never created" — the allocation is demand-driven
  and turns on the moment a NEAR0 layer becomes pickable.
- Source codes are **already reserved**: Star=21, Planet=22, Earth=23
  (`src/data/sources.ts` — append-only rule), so the
  `(sourceCode << 27) | localIdx` pick encoding (`selectionEncoding.ts`)
  needs no change.
- The selection/InfoCard plumbing already resolves bodies:
  `extractSelectionRow` has a `body` arm over `SCENE_BODIES`, and
  `bodyFocusId` / `bodyFocusDistance` / palette body rows shipped with
  plan 02 task 7b.

## The actual work

1. Mark the NEAR0 body layers pickable: pick-draw functions on
   `earthLayer` / `planetsLayer` / `starSpheresLayer` (spheres rasterised flat
   with the pick id; reuse the layers' existing f64 `pos − camPos` +
   `rebaseViewProj` idiom — AU-scale anchors must not go raw through an f32
   vp). Decide whether `starPointsLayer` (sub-pixel dots) should pick at all —
   probably not; the resolved sphere is the pickable representation, and a
   few-px point is an accidental click magnet.
2. Pick shaders for the sphere family (flat r32uint fragment writing
   `(code << 27) | (localIdx + PICK_SENTINEL_OFFSET)`), mirroring the existing
   pick WESL idiom.
3. Map the readback code (21/22/23 + localIdx) to a body `SelectionRef`
   (`{ type: 'body', id }` — index into `SCENE_BODIES` per source type) where
   pick results resolve to refs today.
4. Hover/click behaviors then compose for free (InfoCard pin, focus tween via
   the existing body focus framing).

## Watchpoints

- The pick texel fold must keep NEAR0 in front of COSMO (it already orders
  near→far — verify the slab order source).
- Pick pass frequency/cost: `pick:near0` allocation is per-camera like the
  main pick texture; the Task 11 foreground distance gate should also gate the
  NEAR0 pick rows so cosmic-zoom frames pay nothing.
- Depth within the slab: the existing pick pass relies on draw order rather
  than a depth buffer; body-vs-body overlap (Moon in front of Earth) needs
  either draw-order-by-distance or a depth-tested pick pass for the NEAR0
  group.
