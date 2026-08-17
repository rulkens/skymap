# `starRenderer` rewrites one uniform buffer per draw

The `writeBuffer`-vs-`submit` hazard, in the one body renderer that still has it.
Surfaced again by the analytic-sphere grill
([session](../grill-sessions/analytic-sphere-primitive-2026-07-28.md), Q3).

## Mechanism

`starRenderer` owns exactly one 80-byte `TintedSphereUniforms` buffer and one bind
group against it (`starRenderer.ts:88-113`). `draw` rebuilds the scratch, uploads
it, and issues the indexed draw (`starRenderer.ts:161-173`).

`queue.writeBuffer` is ordered against `queue.submit`, **not** against the draws
recorded between writes. Every write in a frame lands before the GPU executes any
command in that frame's submit, so N draws all read the last body's bytes. The
module header states the precondition as "draw at most once per frame"
(`starRenderer.ts:25-29`); nothing enforces it.

## Two call sites, not one

The known-gap note in `starSpheresLayer.ts:21-30` describes the intra-layer case —
two simultaneously-resolved scene stars in that layer's loop
(`starSpheresLayer.ts:119-129`). There is a second, structurally independent site:
`fieldStarSphereLayer.draw` calls the same renderer for the nearest resolvable Gaia
field star (`fieldStarSphereLayer.ts:240-258`).

Both are `NEAR0` / `foreground:0` / `opaque` rows, registered seven lines apart in
the layer list (`passes/index.ts:308` and `:315`), so both record into the same
render pass before the same submit.

This matters for the fix shape, below.

## Reachability today

Latent. Both layers gate on apparent size:

- `starSpheresLayer` draws only the `spheres` branch of
  `partitionStarsByResolution` at `STAR_RESOLVE_PX` = 4 px — a second
  simultaneously-resolved scene star needs the camera within roughly an AU of two
  seeded stars at once, which the `SCENE_STARS` roster does not permit.
- `fieldStarSphereLayer` needs the camera within solar-radius resolving range of a
  catalogued Gaia star (`fieldStarSphereLayer.ts:217-238`), which is nowhere near
  a scene star — famous stars are subtracted from the Gaia bins.

So the two sites are mutually exclusive in practice, and the failure is
unreachable with today's seeds. It stops being latent the moment either the seed
roster gains a close binary or the star renderer goes analytic — see the caveat.

## Why it gets sharper if `starRenderer` goes analytic

The companion item
([star-renderer-analytic-plus-oblate-giants](2026-07-29-star-renderer-analytic-plus-oblate-giants.md))
would add `camPosLocal` to this same uniform block. A clobbered block today is a
wrong tint on a correctly-shaped sphere. With an analytic fragment it is a wrong
**ray origin**, which moves the silhouette, the depth and the hit test together —
a body drawn in the wrong place, not a body drawn the wrong colour. Fix the buffer
before the conversion, not after.

## Three precedents in the repo, and which one fits

1. **Own buffer + bind group per body** — `texturedBodyRenderer` keys a
   `Map<BodyTextureId, BodyResources>` (`texturedBodyRenderer.ts:337`), each row
   carrying its own `uniformBuffer` and `bindGroup`
   (`texturedBodyRenderer.ts:386-396`), and `draw` writes that row's buffer
   immediately before its draw (`texturedBodyRenderer.ts:596-598`). The atmosphere
   shell uses the same per-body-bundle shape for the same reason
   (`atmosphereShellRenderer.ts:20-34`).
2. **One buffer, 256-byte-aligned dynamic-offset slots, per-pass cursor** —
   `bodyPickRenderer.drawSphere` (`bodyPickRenderer.ts:200-240,424-446`,
   rationale at `:38-68`). One buffer, one bind group, a slot per draw, cursor
   reset on a new pass object.
3. **Instancing** — `planetRenderer` bakes every body's record into one instance
   vertex buffer and issues a single `drawIndexed` (`planetRenderer.ts:132-136`,
   `:196-212`), so no shared uniform exists to clobber. Rationale at
   `planetRenderer.ts:28-41`.

The existing backlog line proposed (3). **Check that against the two call sites
first:** instancing requires one batch, and two independent `ContentLayer` rows
cannot pack into a shared instance buffer without one of them learning about the
other — which is exactly the braid `fieldStarSphereLayer.ts:51-66` argues against
(it deliberately does not append its star to the scene-star set). (2) is the
closest structural match: the contract is one sphere per call with its own matrix,
which is what `bodyPickRenderer` already solved, and its per-pass cursor handles
two callers in one pass by construction. (1) also works but needs a key, and a
field star has no stable body id.

## Files

- `src/services/gpu/renderers/bodies/starRenderer.ts:25-29,88-113,161-173` — the
  buffer, the precondition, the write.
- `src/services/engine/frame/passes/starSpheresLayer.ts:21-30,119-129` — call site
  one and the known-gap note.
- `src/services/engine/frame/passes/fieldStarSphereLayer.ts:240-258` — call site
  two, currently undocumented as a race participant.
- `src/services/engine/frame/passes/index.ts:308,315` — both rows, same pass.
- `src/services/gpu/renderers/bodies/bodyPickRenderer.ts:38-68,200-240,424-446` —
  the dynamic-offset precedent.
- `src/services/gpu/renderers/bodies/texturedBodyRenderer.ts:337,386-396,596-598`
  — the own-buffer-per-body precedent.
