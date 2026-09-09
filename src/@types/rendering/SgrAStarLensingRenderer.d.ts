/**
 * SgrAStarLensingRenderer — handle for the Sgr A* lens pass: a camera-facing
 * billboard classifying each ray as captured (black), escaping (a
 * LUT-deflected sample of the captured sky cubemap), or crossing the
 * accretion annulus (bounded-march emission), composited premultiplied-OVER
 * into the depthless `hdr` target.
 *
 * The LUT (`SchwarzschildDeflectionLut`) is built once at construction and
 * uploaded to a static `r32float` texture — `lut` is
 * exposed back so the layer can read `minImpactParamRs`/`maxImpactParamRs`/
 * `samples.length` for the uniform pack without re-deriving them.
 */

import type { Renderer } from './Renderer';
import type { SchwarzschildDeflectionLut } from '../lensing/SchwarzschildDeflectionLut';

export type SgrAStarLensingRenderer = Renderer & {
  /** The CPU-side LUT this renderer's texture was built from — see the module header. */
  readonly lut: SchwarzschildDeflectionLut;
  /**
   * Draw the lens billboard into the current (depthless, premultiplied-OVER)
   * pass. `uniforms` is the packed 176-byte `SgrAStarLensingUniforms`
   * (`packSgrAStarLensingUniforms`); `skyCubemapView` is this frame's
   * `dimension: 'cube'` view over the `sky-cubemap` render target
   * (`RenderTargets.cubeViewOf`) — read fresh by the caller every frame and
   * rebound here rather than cached at construction, the same reason
   * `additiveUpsample`'s bind group is rebuilt per draw (a cached bind group
   * would risk binding a view a `reconcile()` already replaced).
   */
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array, skyCubemapView: GPUTextureView): void;
};
