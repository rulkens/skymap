import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { StellarStreamMeta } from '../../catalog/@types/StellarStreamMeta';

export type StellarStreamsRibbonPickRenderer = {
  /** Builds the ribbon segments from the meta's centrelines. */
  upload(meta: readonly StellarStreamMeta[]): void;
  /** Frees the segment buffer; `draw` stamps nothing after. */
  clear(): void;
  /** Stamps every stream's ribbon into the NEAR0 pick target, or only `focusedStream`'s (−1 = all). */
  draw(
    pass: GPURenderPassEncoder,
    rebasedVp: Float32Array,
    viewportPx: Readonly<Vec2>,
    pxPerRad: number,
    eye: Readonly<Vec3>,
    focusedStream: number,
  ): void;
  destroy(): void;
};
