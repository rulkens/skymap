/**
 * EnginePickingState — the pick driver's mutables on the canonical `EngineState`.
 *
 * Nothing camera-shaped lives here: the pick passes rebuild their camera from
 * plain values at pick time (`pickUniformBytesOf`, the pick-time slab view), and
 * hover / select identity lives in the RTK `selection` slice. Pending hover and
 * select requests live in the `input` slice; `createPickDriver` answers them.
 */

export type EnginePickingState = {
  /**
   * One pick at a time, shared by hover and select: `pickProgram.pick` resolves
   * null for a second call while a readback is in flight.
   */
  pickInFlight: boolean;
};
