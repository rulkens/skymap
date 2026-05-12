/**
 * PhaseLocals — phase-local carrier for IIFE-scoped device/context
 * handles that survive past `initGpu` but don't belong on
 * `EngineState`.  Written by `initGpu`; read by `wireSlots`,
 * `wireInput`, and `startLoop`.
 *
 * `device` and `context` remain on this bag because they don't have a
 * `state.gpu.*` home today.  Moving them would mean adding them to
 * `EngineGpuHandles` (the shape behind `state.gpu`); out of scope for
 * M1, but tracked as a follow-up in the 2026-05-11 audit.
 */
export type PhaseLocals = {
  device: GPUDevice;
  context: GPUCanvasContext;
};
