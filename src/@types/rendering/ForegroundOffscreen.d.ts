/**
 * ForegroundOffscreen — full-resolution intermediate render target for the
 * foreground (opaque Earth/star) pass, carrying both an 'rgba16float'
 * colour texture and a 'depth32float' depth texture.
 *
 * ### Why a separate offscreen, not the PostProcess HDR target
 *
 * PostProcess owns the HDR target — every galaxy/disk/volume renderer
 * writes into it with additive blending and 'depthWriteEnabled: false'
 * (see postProcess.ts:48-62 for the history of why depth was removed
 * from that target).  The foreground pass draws OPAQUE geometry (Earth,
 * Moon, Sun) that must occlude background geometry by depth-test; depth
 * ordering only makes sense within one coherent depth budget.  Drawing
 * into the HDR target would require re-adding a depth attachment there
 * and declaring matching depthStencil state in every existing additive
 * pipeline — a cross-cutting change that previously bit us.  Instead:
 * render opaque geometry here, then OVER-composite the result onto HDR.
 *
 * ### Why 'rgba16float'
 *
 * Matches the HDR target's format so colours can accumulate dynamic
 * range (e.g. a star bloom) without clipping before the OVER composite.
 *
 * ### Why 'depth32float'
 *
 * The foreground pass uses an adaptive near/far camera with a wide
 * logarithmic spread — the zoom-to-Earth feature moves the near plane
 * across many orders of magnitude.  'depth32float' provides 32-bit
 * linear precision, which is the most accurate available and avoids
 * z-fighting artefacts when the near/far spread is large.
 * 'depth24plus' only guarantees 24 bits and may be silently promoted
 * to 'depth24plus-stencil8'; 'depth32float' is exact on all WebGPU
 * implementations.
 *
 * ### Why full resolution
 *
 * The volume offscreen is intentionally downsampled (3x) because
 * raymarching is expensive per fragment and the result is bandlimited.
 * Opaque geometry (planet surfaces, star disks) has hard edges and
 * sub-pixel detail that bilinear upsampling would smear — it must be
 * rasterised at full pixel density.
 */

import type { Size } from './Size';

export type ForegroundOffscreen = {
  /** Current full-resolution colour-attachment view ('rgba16float'). Stable until 'resize()'. */
  readonly colorView: GPUTextureView;
  /** Current full-resolution depth-attachment view ('depth32float'). Stable until 'resize()'. */
  readonly depthView: GPUTextureView;
  /** Recreate both textures at a new canvas size. Old views become invalid. */
  resize(size: Size): void;
  /** Release the colour and depth textures. */
  destroy(): void;
};
