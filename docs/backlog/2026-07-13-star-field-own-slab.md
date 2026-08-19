# Star field (points + captions + connectors) → its own slab

**Status:** needs-verification (re-scoped 2026-08-19 — slab split retired)
**Area:** Rendering / frame architecture

## Verdict (2026-08-19 research, during the Edenhofer dust-volume design)

**Do not build the STARS slab.** Every defect below traces to NEAR0's far
plane sweeping through the parsec anchors — and NEAR0 has been **infinite-far
reversed-Z** since 2026-07-20 (`computeForegroundViewProj.ts:145`, zFar
omitted; spec `2026-07-20-reversed-z-near0-depth.md`). There is no far clip
any more, and depth precision is near/far-ratio-independent, so the bracket
mismatch this item is built on no longer exists. That spec also already
considered and **rejected** a new slab for this class of problem ("permanent
machinery to manage the constraint"). The Edenhofer dust volume likewise
lands on NEAR0 with no new slab (see
[`../superpowers/specs/2026-08-20-edenhofer-dust-volume.md`](../superpowers/specs/2026-08-20-edenhofer-dust-volume.md)).

What remains of this item:

1. **Clip-z clamp audit.** The four `CLIP_Z_EPS` clamps
   (`starPoints/vertex.wesl:123`, `starCatalog/vertex.wesl:458`,
   `labels/vertex.wesl:83`, `markerLines/vertex.wesl:56`) were written to
   defeat far-plane clipping under classic depth. Under reversed-Z,
   `min(clip.z, w·(1−ε))` guards the **near** side instead — they silently
   changed meaning. Verify whether they're still load-bearing for close
   flybys (anchor nearer than `dist·1e-4`) or deletable; the starCatalog one
   is dual-purpose (pick depth-band force) and stays either way.
2. **The two folded-in knots below** — both slab-independent; do them
   whenever their files are next open.

The original problem statement and proposal are kept below for the record.

## Problem

The parsec-scale local star map lives in the NEAR0 slab, whose adaptive
near/far bracket (`foregroundFrustum`: `[dist·1e-4, max(dist·100, FAR_MIN_MPC)]`)
is sized for Earth-scale **depth-tested** bodies. The star field only needs
x/y frustum coverage — it is drawn depthless (additive points into HDR;
captions/connectors OVER onto the swap chain) — but inherits the bracket
anyway. Every star-field defect fixed during zoom-to-earth plan 03 Task 10
was a symptom of that mismatch:

- The far plane sweeping inside the parsec anchors on descent → clip-z
  clamps added to THREE shaders (`starPoints/vertex.wesl`,
  `labels/vertex.wesl`, `markerLines/vertex.wesl`).
- The "which captions can be visible where the far plane bites" coupling
  argument in `foregroundLabelsLayer`'s module header (rewritten twice as
  the fade semantics changed).
- The ill-conditioned NEAR0 matrix at deep zoom (near ~1e-16 with parsec
  content) breaking the f32 CPU un-project in the caption placement chain
  (fixed by moving the chain to f64).

`slabs.ts` was explicitly designed for this: "a future third slab … is one
more row, not a new code path".

## Proposed direction

Split by **depth semantics**, not by body type:

- Depth-tested bodies (Earth, planets, resolved star spheres) stay in
  NEAR0 with the tight adaptive bracket — Moon-in-front-of-Earth needs the
  shared depth buffer.
- The depthless star-field overlays (star points, star/planet/Earth
  captions, connectors) move to a `STARS` slab row whose bracket is sized
  for its own content (roughly sub-AU → ~100 pc; exact near policy is the
  main design question — the Sun's point/caption at 1 AU must not
  near-clip when standing on Earth).

Payoff: the three shader clip-z clamps and the far-plane coupling
documentation become deletable — visibility of the star field stops being
entangled with the Earth-scale depth bracket. This is the un-braiding move;
the clamps are the compensations.

## What it does NOT buy

- The f64 placement math stays: any bracket spanning Sun-at-1-AU to
  Pollux-at-10-pc still spans ~7 decades, and the camera range spans more.
- The distance-fade band, declutter, priority table, and envelope are
  presentation logic, orthogonal to the slab split.

## Folded-in from the plan 03 entanglement radar

Two small knots live in the code this redesign rebuilds anyway; absorb them:

- **Caption envelope state at module scope** — `foregroundLabelsLayer.ts`
  holds `captionAlpha: Map` + `captionClockMs` as module singletons, so the
  fade state survives engine destroy/recreate (latent, not live: a huge dt
  lands captions on target, and the app never re-creates the engine in one
  page). The un-braided shape is the label director's: hold the envelope in
  a per-engine closure (`createForegroundLabelsLayer()`) or on
  `state.subsystems` — mutable time-coupled state does not belong at module
  scope even when immutable derived data (BASE_LABELS) does.
- **Forward-projection formula duplicated four ways** — `labelLeaderLine`,
  `foregroundLabelsLayer`'s `projectToScreenPx`, the director's declutter
  projection, and the shader-sizing sites each hand-roll column-major
  project-to-screen. Extract one `utils/camera/projectWorldToScreenPx.ts`
  when these call sites are reworked (mind the director loop's per-frame
  alloc discipline).

## Design questions

1. Bracket policy for the STARS slab: fixed vs camera-adaptive; near floor
   that keeps the Sun overlay alive from Earth's surface.
2. Frame-program shape: today star points ride a dedicated `(hdr, NEAR0)`
   step so they share the galaxies' tone curve; the captions ride
   `(swap, NEAR0)`. Both steps would re-home to the new slab index — check
   `timedSlotsOf` ordering and the GPU-timings panel.
3. Pick interplay: `pickProgram` folds per-slab pick texels near→far; a
   third slab must slot into that order (see the foreground-body picking
   backlog item, `2026-07-12-foreground-body-picking.md` — if star points
   stay unpickable and spheres stay in NEAR0, the pick fold may be
   unaffected).
4. Task 11's `FOREGROUND_MAX_DISTANCE_MPC` gate currently empties both
   NEAR0 step groups; the STARS slab layers need the same (or a wider)
   gate so cosmic-zoom frames still skip everything.

## References

- `src/services/engine/frame/slabs.ts` (the "one more row" docblock)
- `src/utils/camera/foregroundFrustum.ts` (bracket + FAR_MIN_MPC history)
- zoom-to-earth plan 03 Task 10 report (`.superpowers/sdd/task-10-report.md`,
  session-local) — the defect chain that motivated this
- ADR 0010 (continuous floating origin, plan 03 Task 14) should
  cross-reference this item as the anticipated slab-tiling follow-up
