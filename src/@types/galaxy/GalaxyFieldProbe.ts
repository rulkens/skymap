import type { GalaxyFieldCloudPlacementReadback } from './GalaxyFieldCloudPlacementReadback';
import type { GalaxyFieldDigVeilPlacementReadback } from './GalaxyFieldDigVeilPlacementReadback';
import type { GalaxyFieldDustPlacementReadback } from './GalaxyFieldDustPlacementReadback';

/** Debug-only surface, driven by the host's GPU-error probe. No production caller. */
export type GalaxyFieldProbe = {
  peekRecords(buffer: 'field' | 'hii', offset: number, count: number): Promise<Float32Array>;
  requestDustPlacementReadback(opts?: {
    readonly forceGeneratorIsFluid?: boolean;
  }): Promise<GalaxyFieldDustPlacementReadback | null>;
  requestArmSpurCloudPlacementReadback(): Promise<GalaxyFieldCloudPlacementReadback | null>;
  requestArmCloudPlacementReadback(): Promise<GalaxyFieldCloudPlacementReadback | null>;
  requestDigVeilPlacementReadback(): Promise<GalaxyFieldDigVeilPlacementReadback | null>;
  /** The REAL production pair, so a host-side isolated-range draw exercises the real fragment shader. */
  readonly fieldSplatPipe: GPURenderPipeline;
  /**
   * `null` until the first `encode` has synced; afterwards it reflects the LAST
   * `encode`'s resources — a `setMixture` that regrew `fieldComps` leaves this
   * bound to the destroyed buffer until the next `encode`. Probe callers must
   * render a frame between mutation and readback (`settleFrames` already does).
   */
  readonly fieldSplatBG: GPUBindGroup | null;
};
