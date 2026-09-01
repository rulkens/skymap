/**
 * FrameStep — the frame as data: one entry in the ordered program the
 * executor walks each frame, replacing the imperative call sequence in
 * `renderFrame`.
 *
 * Three kinds cover everything a frame currently does:
 *
 *   - `'compute'` — a pre-render compute dispatch, looked up by `name` in a
 *     COMPUTE name→fn table (e.g. the flow-field particle seed/integrate
 *     pass). A top-level step rather than something a render step invokes
 *     internally, so the compute-before-render ordering is visible as
 *     program order instead of being implicit in a renderer's draw call.
 *   - `'render'` — draw every enabled `ContentLayer` whose `(target, slab)`
 *     matches this step's, in registry order. The `target`/`slab` pair
 *     selects a layer group out of data the layers already carry, so two
 *     `'render'` steps with different `(target, slab)` pairs draw disjoint
 *     sets by construction — no separate bookkeeping needed for e.g. the
 *     cosmological-over group vs. the near-field-over group both targeting
 *     `swap`.
 *   - `'composite'` — merge one target into another via the Compositor,
 *     per the embedded `CompositeStep`.
 *   - `'bloom'` — a self-contained screen-space bloom sub-pipeline (bright →
 *     downsample×4 → upsample×4 → fold into HDR) run by `runBloom`. It is one
 *     step rather than N reused-target render steps because a ping-pong mip
 *     pyramid writes the same target twice with different ops (a downsample that
 *     clears, then an additive upsample that loads), which the `(target, slab)`
 *     render-step model cannot express: the executor re-fires every layer
 *     matching a step's `(target, slab)`, so a reused-target upsample layer
 *     would fire prematurely at its target's downsample step and read a
 *     not-yet-cleared (stale, last-frame) level. `runBloom` opens its ten passes
 *     in strict order instead, so every source is written earlier in the same
 *     sequence.
 *
 * A `FrameStep[]` array (the concrete `FRAME` program) is therefore a
 * complete, inspectable, order-sensitive description of a frame — where
 * today's ordering decisions (e.g. "captions draw after the foreground
 * composite so they land on top of the bodies") are visible as step order
 * in one array, not implicit in which function calls which.
 */

import type { CompositeStep } from './CompositeStep';
import type { CubeFace } from '../../rendering/CubeFace';

export type FrameStep =
  | { kind: 'compute'; name: string }
  | {
      kind: 'render';
      target: string;
      slab: number;
      /**
       * Depth load-op for this step's pass. Absent ⇒ the same first-touch rule
       * the colour attachment follows (clear on the frame's first pass against
       * the target, load after). Steps that SHARE a depth target but must not
       * share its depth — successive slabs drawn back-to-front into one
       * foreground row — declare `'clear'` to restart depth mid-frame.
       */
      depthLoad?: 'clear' | 'load';
      /**
       * Which array layer of a `fixedSizePx` target this step writes — today
       * only the black-hole lens's 6-face sky-cubemap capture (Task 12).
       * Absent for every ordinary render step. Its sole job is disambiguating
       * several `(target, slab)` steps that would otherwise collide: all six
       * faces share `('sky-cubemap', NEAR0)`, unlike a body row (which gets
       * its own `slab` index and so is unique without help) — see
       * `timedSlotRowsOf`'s per-step naming and `executeFrame`'s matching
       * timing-slot lookup, frameProgram.ts / executeFrame.ts.
       */
      face?: CubeFace;
      /**
       * Splits the shared `(hdr, NEAR0)` roster step around the black-hole
       * lens's own `(hdr, BODY[k])` step (Task 14b, Ruling 9), so
       * `orbit-trails`/`body-glints` draw AFTER the lens rather than being
       * sampled by it. Absent ⇒ every layer matches, the pre-Task-14b
       * behaviour. `'pre'` admits every `(hdr, NEAR0)` layer EXCEPT those
       * opted into `ContentLayer.hdrPostLensing`; `'post'` (emitted only
       * when the lens step fires) admits ONLY those. Two steps sharing one
       * `(target, slab)` would otherwise collide on one GPU-timing group
       * slot — `slabs.ts`'s `matchesLensPhase` is the single predicate both
       * `timedSlotRowsOf` and `executeFrame` read, and
       * `renderStepTimingSlotName` gives the `'post'` step's group-total
       * slot a distinct name so it can't collide with `'pre'`'s.
       */
      lensPhase?: 'pre' | 'post';
    }
  | { kind: 'composite'; step: CompositeStep }
  | { kind: 'bloom' };
