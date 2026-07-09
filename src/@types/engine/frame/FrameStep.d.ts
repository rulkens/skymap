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
 *
 * A `FrameStep[]` array (the concrete `FRAME` program) is therefore a
 * complete, inspectable, order-sensitive description of a frame — where
 * today's ordering decisions (e.g. "captions draw after the foreground
 * composite so they land on top of the bodies") are visible as step order
 * in one array, not implicit in which function calls which.
 */

import type { CompositeStep } from './CompositeStep';

export type FrameStep =
  | { kind: 'compute'; name: string }
  | { kind: 'render'; target: string; slab: number }
  | { kind: 'composite'; step: CompositeStep };
