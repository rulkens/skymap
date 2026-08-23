# Three renderer landmines from the Quest VR spike, not yet in docs/RENDERER.md

Surfaced by the Quest 3 WebXR spike (branch `worktree-quest-vr-spike`, draft
PR #625, not merging). Stereo rendering exercises code paths mono never does
— a second walk of the same frame, a second view drawn into the same
encoder — and each one found a trap that mono's single-camera-per-frame
world hides. None of these are bugs on `main` today; they are landmines the
next multi-view or multi-pass feature (stereo, cube capture, shadow pass)
would otherwise rediscover the hard way.

## What it is

Three additions for `docs/RENDERER.md`:

1. **`WeakMap<ReadyFrameContext, …>` memos are per-camera, not per-frame.**
   The pattern (`prepareStarCut`'s `preparedByCtx`, and others) reads as
   "compute once per frame" but actually means "compute once for the first
   camera that asks this frame." A second walk of the same `ctx` with a
   different camera (a second eye, a cube-map face, a shadow view) silently
   gets served the first camera's cached result. Bitten four times in the
   spike: the earth-layer prepared planner, `starCatalogLayer`'s
   `prepareStarCut`, `cosmoLabelProjection.ts`, and `near0LabelProjection.ts`.
2. **Precision-rebased data must carry its rebase origin with it.** The
   `produceSceneBodyCaptions` convention of subtracting camera position at
   production time and carrying the result forward, generalized: whenever
   data is baked relative to an origin, the origin has to travel with the
   data rather than being re-derived at the consumption site. Two spike bugs
   (including the star-cut one, see
   [`star-cut-origin-carrying`](2026-08-23-star-cut-origin-carrying.md))
   came from prepare-time and draw-time independently choosing origins that
   only coincidentally agreed.
3. **`queue.writeBuffer` uniform uploads execute at submit, not at record
   time.** Recording multiple views or passes that rewrite the same uniform
   buffer into one command encoder means last-write-wins for all of them —
   the GPU sees only the final write when the encoder submits. Per-view
   uniforms need either per-view buffer offsets or double-buffering; a
   single shared uniform buffer cannot serve two views recorded into one
   encoder.

## Why it matters

None of the three are exploitable in today's single-camera renderer. They
become live bugs the moment any feature draws the same frame from more than
one viewpoint — which is exactly the shape stereo VR, cube-map environment
capture, and shadow mapping all share. Documenting them now means the next
such feature finds the trap in the docs instead of in a debugging session.

## Approach

Add the three bullets above to `docs/RENDERER.md`, each with the concrete
file(s) that already exhibit the pattern on `main` (so the note points at
real code, not hypotheticals) — `prepareStarCut`'s `preparedByCtx` WeakMap
and the `produceSceneBodyCaptions` subtract-camPos convention are both on
`main` today; the cosmo/near0 label-projection and writeBuffer-ordering
notes should cite whichever `main` files most closely parallel what the
spike hit.
