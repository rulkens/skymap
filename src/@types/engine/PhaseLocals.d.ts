/**
 * PhaseLocals — phase-local carrier for IIFE-scoped device/context
 * handles that survive past `initGpu` but don't belong on
 * `EngineState`.  Written by `initGpu`; read by `wireSlots`,
 * `wireInput`, and `startLoop`.
 *
 * `device` and `context` live on this bag because they have no
 * `state.gpu.*` home; giving them one would mean widening
 * `EngineGpuHandles` (the shape behind `state.gpu`).
 */
export type PhaseLocals = {
  device: GPUDevice;
  context: GPUCanvasContext;
};
