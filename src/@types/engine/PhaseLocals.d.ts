/**
 * PhaseLocals — phase-local carrier for IIFE-scoped handles that survive
 * past `initGpu` but don't belong on `EngineState`.  Written by `initGpu`;
 * `device`/`context` are read by `wireSlots`, `wireInput`, and `startLoop`;
 * `unwatchHdrCapability` is read only by `engine.ts`'s `destroy()`.
 *
 * None of the three fields get a `state.gpu.*` home; giving `device`/
 * `context` one would mean widening `EngineGpuHandles` (the shape behind
 * `state.gpu`), and `unwatchHdrCapability` is a plain cleanup closure, not a
 * GPU resource.
 */
export type PhaseLocals = {
  device: GPUDevice;
  context: GPUCanvasContext;
  /**
   * Removes the `matchMedia` `change` listener `initGpu` registers via
   * `watchHdrCapability` (`device.ts`) to keep `engineHdrCapabilityChanged`
   * live. Must be called on engine teardown or the listener — and its
   * closure over the store — leaks for the page's lifetime.
   */
  unwatchHdrCapability: () => void;
};
