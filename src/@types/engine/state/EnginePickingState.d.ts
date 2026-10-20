/**
 * EnginePickingState — the pick driver's mutables on the canonical `EngineState`.
 *
 * Nothing camera-shaped lives here: the pick passes rebuild their camera from
 * plain values at pick time (`pickUniformBytesOf`, the pick-time slab view), and
 * hover / select identity lives in the RTK `selection` slice. Pending hover and
 * select requests live in the `input` slice; `createPickDriver` answers them.
 */

import type { Vec2 } from '../../math/Vec2';

export type EnginePickingState = {
  /**
   * One pick at a time, shared by hover and select: `pickProgram.pick` resolves
   * null for a second call while a readback is in flight.
   */
  pickInFlight: boolean;
  /**
   * Live pointer position in TEXTURE pixels (`cssToTexPx` applied at the
   * writer, so every frame-side reader is already in the viewport's own
   * space). Written ONLY while the `terrain-pick-marker` debug overlay is on —
   * that toggle is what makes a pointermove worth a wake and a frame-visible
   * write; off, this stays null and the whole debug path is unreachable.
   * `null` also means "no mouse has moved yet" (touch and pen never write it).
   */
  cursorTexPx: Vec2 | null;
};
