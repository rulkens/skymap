import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { StellarStreamsPayload } from '../../catalog/@types/StellarStreamsPayload';
import type { StellarStreamsLook } from './StellarStreamsLook';

export type StellarStreamsRenderer = {
  hasData(): boolean;
  upload(payload: StellarStreamsPayload): void;
  /** Frees the instance buffer; `hasData()` is false after. */
  clear(): void;
  draw(
    pass: GPURenderPassEncoder,
    rebasedVp: Float32Array,
    viewportPx: Readonly<Vec2>,
    pxPerRad: number,
    eye: Readonly<Vec3>,
    timeSec: number,
    looks: readonly [StellarStreamsLook, StellarStreamsLook],
    /** Multiplies each look's intensity: the handed fade. */
    opacity: number,
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
