import type { GalaxyFieldHost } from './GalaxyFieldHost';

/** The runtime's hold on the field host: it only creates and destroys, lazily. */
export type FieldHostSlot = {
  /**
   * Create on the first `true`, destroy on `false`. While on:
   * `host.setTuning(tuningFor(dust))` every call, then `ensureFresh`; returns
   * the live host, or null when off. The host's identity keys skip unchanged
   * sections, so re-tuning every frame is free.
   */
  sync(field: boolean, dust: boolean): GalaxyFieldHost | null;
  destroy(): void;
};
