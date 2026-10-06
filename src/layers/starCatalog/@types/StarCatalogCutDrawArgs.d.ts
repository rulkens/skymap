/**
 * One stream of the GPU cut for one source: the per-view camera and the
 * source-independent shader scalars. No node arrays — the lists stay on the GPU.
 */

import type { Vec2 } from '../../../@types/math/Vec2';
import type { SourceType } from '../../../@types/data/SourceType';
import type { StarDrawStream } from './StarDrawStream';

export type StarCatalogCutDrawArgs = {
  readonly source: SourceType;
  readonly stream: StarDrawStream;
  /** A sky-cubemap face: reads the capture cut, not the frame's. */
  readonly capture: boolean;
  /**
   * `fs` (per-glow knee) or `fsLinear`. Leaves always knee; aggregates draw
   * linear for the `star-upsample` composite to knee — except on a capture
   * face, which no upsample follows.
   */
  readonly knee: boolean;
  /** Rebased about the cut's origin, not this view's eye. */
  readonly vp: Float32Array;
  readonly viewportPx: Vec2;
  readonly pxPerRad: number;
  readonly sizePx: number;
  readonly brightness: number;
  readonly glowOverlap: number;
  readonly aggregateIntensityCap: number;
  readonly viewSlot: number;
};
