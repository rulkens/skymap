import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { StellarStreamsPayload } from '../../catalog/@types/StellarStreamsPayload';
import type { StellarStreamsLook } from './StellarStreamsLook';
import type { StellarStreamsFocus } from './StellarStreamsFocus';

export type StellarStreamsRenderer = {
  hasData(): boolean;
  upload(payload: StellarStreamsPayload): void;
  /** Frees the instance buffer; `hasData()` is false after. */
  clear(): void;
  /** Draws one look; `which` names its uniform block, so both looks can draw in one submit. */
  draw(
    pass: GPURenderPassEncoder,
    which: 'streak' | 'haze',
    rebasedVp: Float32Array,
    viewportPx: Readonly<Vec2>,
    pxPerRad: number,
    eye: Readonly<Vec3>,
    timeSec: number,
    look: StellarStreamsLook,
    /** Multiplies the look's intensity: the handed fade. A product of 0 draws nothing. */
    opacity: number,
    focus: StellarStreamsFocus,
  ): void;
  /** Stamps `look`'s quads (the streak look) into the NEAR0 pick target, each word naming its stream. */
  drawPick(
    pass: GPURenderPassEncoder,
    rebasedVp: Float32Array,
    viewportPx: Readonly<Vec2>,
    pxPerRad: number,
    eye: Readonly<Vec3>,
    timeSec: number,
    look: StellarStreamsLook,
  ): void;
  destroy(): void;
};
