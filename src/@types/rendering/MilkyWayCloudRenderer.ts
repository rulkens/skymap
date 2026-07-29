/**
 * MilkyWayCloudRenderer — public handle for the Milky Way point-cloud draw.
 *
 * The cloud is drawn as two instanced-billboard passes over the generated
 * star/dust records: an ADDITIVE star pass (soft radial glows that sum their
 * light) and a MULTIPLICATIVE dust pass (per-channel transmittance that
 * darkens + reddens the light behind it).
 *
 * ### Why two entry points rather than one `draw`
 *
 * The two passes render into DIFFERENT TARGETS, so they cannot share a render
 * pass encoder. Stars draw into the reduced-resolution `mw-aggregate`
 * offscreen (their summed glow is a low-frequency field, and they are the
 * fill-bound half — see the `mw-aggregate` row in `renderTargets.ts`); dust
 * draws full-res into HDR, where its transmittance multiplies the real
 * cosmological accumulation. Each entry point writes its OWN uniform buffer,
 * so neither depends on the other having run first.
 *
 * Satisfies the shared `Renderer` contract (`label` + `destroy`).
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
