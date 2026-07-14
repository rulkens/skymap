# Foreground-body picking (Sun / Earth / planets / local stars)

**Status:** blocked — sequence after PR #436 (renderers folder reorg, relocates the
body renderers this touches) AND Gaia star bin plan 03 (the Gaia renderer replaces
the 24-local-stars rendering story, so star picking should be designed once, against
it). User decision 2026-07-14.
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

## 2026-07-14 design-session notes (brainstorm parked at approach stage)

Decisions (user):

- **Unified pick spine is the goal**: in theory every object in the system
  (galaxies, structures, stars, planets) is selectable through the same
  `selectionEncoding` → per-slab `pickProgram` rasterize → `frontmostPick`
  fold → `RESOLVE_PICK` path. That spine already exists and is
  object-agnostic; new families only add pick *rasterization* (a small flat
  shader each) plus a `RESOLVE_PICK` arm. Do not build a parallel pipeline.
- **Star points ARE pickable** (not just resolved spheres) — mirror the
  galaxy `pointRenderer` pick idiom (instanced pick billboards writing the
  packed id).
- Sequencing: #436 first, then Gaia plan 03, then this — so star picking is
  designed once against the Gaia-era star renderer.

Exploration findings that correct/extend the sections above:

- **The depth watchpoint above is already solved**: `pickProgram.ts` opens
  every slab's pick pass with a depth attachment and pins
  `NEAR0_DEPTH_FORMAT = 'depth32float'` (matching `foreground:0`'s color
  depth). Body pick pipelines just need the same
  `depthStencil { depth32float, depthWriteEnabled, 'less' }` profile their
  visual siblings already use — Moon-in-front-of-Earth comes free.
- **Stable-id trap (real gap)**: `planetsLayer` packs only the sub-pixel-
  resolved subset (culled planets get no instance slot) and
  `starSpheresLayer`/`starPointsLayer` draw `partitionStarsByResolution`'s
  camera-dependent subset of `SCENE_STARS` — so `@builtin(instance_index)`
  is NOT a stable body id. The pick id must carry each body's stable seed
  index explicitly; the new `RESOLVE_PICK` arms (`star`/`planet`/`earth`)
  translate stable index → string id for the existing `{type:'body', id}`
  SelectionRef arm (`extractSelectionRow` already resolves it).
- **The `@group(0)` shared-pick-camera prefix contract is COSMO-specific**
  (it exists for the shared point-pick camera BGL). Body renderers bake MVP
  CPU-side via `composeBodyMvp` (f64, then `narrowMat4` at upload) and have
  no shared camera group — their pick pipelines should follow that
  own-uniform pattern, not the COSMO shared-camera idiom.
- `enabled()` on the body layers already carries the foreground distance
  gate + sub-pixel culls, and `pickablesBySlab` filters on `enabled` — so
  faded/culled bodies are unpickable and cosmic-zoom frames never allocate
  `pick:near0`, all by construction.
- Sketched approach (pre-Gaia, revisit): one shared `bodyPickRenderer` +
  flat sphere-pick shader serving earth/planets/star-spheres `drawPick`
  (per-draw uniform `{mvp, packedId}`, ≤10 draws so no instancing), star
  points via the pointRenderer-style instanced pick path.
