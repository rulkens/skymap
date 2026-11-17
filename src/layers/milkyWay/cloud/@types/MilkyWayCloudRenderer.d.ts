/**
 * MilkyWayCloudRenderer — public handle for the Milky Way point-cloud draw:
 * two entry points (additive stars, multiplicative dust), one per target,
 * each writing its own uniform buffer — see `milkyWayCloudRenderer.ts`'s
 * module header for why. Satisfies the shared `Renderer` contract.
 */

import type { MilkyWayCloudDrawArgs } from './MilkyWayCloudDrawArgs';

export type MilkyWayCloudRenderer = {
  /** Human-readable identifier (`'milkyWayCloudRenderer'`). Part of the `Renderer` contract. */
  readonly label: string;
  /**
   * Pack the star uniform buffer and issue the additive star billboard draw.
   * Called against the `mw-aggregate` offscreen, so `args.viewportPx` must be
   * that target's texture size, not the canvas size — the vertex stage's
   * pixel-space sprite clamp is expressed in the target's own pixels.
   */
  readonly drawStars: (pass: GPURenderPassEncoder, args: MilkyWayCloudDrawArgs) => void;
  /**
   * Pack the dust uniform buffer and issue the multiplicative-transmittance
   * dust draw into HDR. A no-op when the generation carved no dust layout
   * (`args.buffers.dustBuf` null).
   */
  readonly drawDust: (pass: GPURenderPassEncoder, args: MilkyWayCloudDrawArgs) => void;
  /** Release both uniform buffers and the shared corner-quad buffer. */
  readonly destroy: () => void;
};
