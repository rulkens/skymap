/**
 * FrameContext — the read-only snapshot a visualization needs to draw ONE frame.
 *
 * Why this exists: the engine runs the render loop and owns all the moving
 * state (camera, clock, canvas size, the param store). A visualization should
 * not reach back into the engine or the store to fetch those — that would
 * couple every layer to the engine's internals and make layers untestable in
 * isolation. Instead the engine assembles this flat, immutable bundle once per
 * frame and hands it to each enabled layer's `encodeCompute`/`encode`.
 *
 * It carries everything a layer needs and nothing more:
 *   - `viewProj` — the combined view-projection matrix for this frame.
 *   - `dt` — seconds since the previous frame (clamped by the engine so a
 *     background tab resuming doesn't produce a huge integration step).
 *   - `frame` — monotonically increasing frame index (useful for seeding
 *     per-frame noise / ping-pong buffers deterministically).
 *   - `size` — the drawable size in device pixels (for aspect / screen-space
 *     work).
 *   - `enabled` — the set of layer ids active this frame, so a layer can cheaply
 *     check whether a sibling it composites with is on.
 *   - `params` — the flattened tunable values (keyed by SliderSpec id) the UI
 *     produced. A layer reads its own keys out of this record.
 *
 * Everything is `readonly`: a frame snapshot is produced by the engine and
 * consumed by layers; no layer should mutate it.
 */
import type { Mat4 } from '../../../../src/@types/math/Mat4';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

export type FrameContext = {
  readonly viewProj: Mat4;
  readonly dt: number;
  readonly frame: number;
  readonly size: Vec2;
  readonly enabled: ReadonlySet<string>;
  readonly params: Readonly<Record<string, number>>;
};
