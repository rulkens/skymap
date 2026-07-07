/**
 * MilkyWayCloudRenderer — public handle for the Milky Way point-cloud draw.
 *
 * The cloud is drawn as two instanced-billboard passes over the generated
 * star/dust records: an ADDITIVE star pass (soft radial glows that sum their
 * light) followed by a MULTIPLICATIVE dust pass (per-channel transmittance
 * that darkens + reddens the light behind it). Both passes run inside the
 * app's HDR pass and share one uniform buffer; see `milkyWayCloudRenderer.ts`
 * for why they still need two separate pipelines + bind groups.
 *
 * Satisfies the shared `Renderer` contract (`label` + `destroy`).
 */

import type { MilkyWayCloudDrawArgs } from './MilkyWayCloudDrawArgs';

export type MilkyWayCloudRenderer = {
  /** Human-readable identifier (`'milkyWayCloudRenderer'`). Part of the `Renderer` contract. */
  readonly label: string;
  /**
   * Pack the shared uniform buffer once, then issue the star draw followed by
   * the dust draw (stars first so dust multiplies over the summed starlight).
   * The dust pass is skipped when `args.buffers.dustBuf` is null.
   */
  readonly draw: (pass: GPURenderPassEncoder, args: MilkyWayCloudDrawArgs) => void;
  /** Release the shared uniform + corner-quad buffers. */
  readonly destroy: () => void;
};
