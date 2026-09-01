/**
 * ViewSlotUniformRing — a fixed-size uniform buffer, multiplexed across the
 * frame's view slots (`ReadyFrameContext.viewSlot`) so a sky-cubemap capture
 * sweep's several `draw()` calls (different synthetic contexts, one shared
 * `submit()`) never overwrite each other's bytes before the GPU reads them —
 * see `createViewSlotUniformRing`'s doc for the write-before-submit race this
 * exists to close.
 */
export type ViewSlotUniformRing = {
  /** Upload `data` into `slot`'s own physical buffer, immediately. */
  writeSlot(slot: number, data: BufferSource): void;
  /** The bind group bound to `slot`'s own physical buffer. */
  bindGroupOf(slot: number): GPUBindGroup;
  /** Release every slot's buffer. */
  destroy(): void;
};
