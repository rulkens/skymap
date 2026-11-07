/**
 * AntiqueLook — the antique-atlas look: the tone-mapped `print`, its captions
 * and foreground:0's body coverage re-drawn as an engraved, hand-coloured plate
 * on laid paper, onto the swap chain.
 */

import type { FrameView } from '../engine/frame/FrameView';
import type { EngineState } from '../engine/state/EngineState';
import type { GpuTimingService } from '../gpu/timing/GpuTimingService';
import type { Renderer } from './Renderer';

export type AntiqueLook = Renderer & {
  /**
   * Opens its own passes in order (paper bake when the sheet was reallocated,
   * reduce, glow, peak suppression, glyphs, decor, plate), the way `runBloom`
   * does. `overlay` null ⇒ no captions this frame.
   */
  encode(
    encoder: GPUCommandEncoder,
    ctx: FrameView,
    state: EngineState,
    io: {
      readonly print: GPUTextureView;
      readonly overlay: GPUTextureView | null;
      readonly swap: GPUTextureView;
    },
    timing: GpuTimingService,
  ): void;
};
