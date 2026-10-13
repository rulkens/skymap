/**
 * One stream of the GPU cut for one source: the per-view camera and the
 * source-independent shader scalars. The lists stay on the GPU.
 */

import type { Vec2 } from '../../../@types/math/Vec2';
import type { SourceType } from '../../../@types/data/SourceType';
import type { StarDrawStream } from './StarDrawStream';
import type { StarFocusSphere } from './StarFocusSphere';

export type StarCatalogCutDrawArgs = {
  readonly source: SourceType;
  readonly stream: StarDrawStream;
  /** A sky-cubemap face: reads the capture cut, not the frame's. */
  readonly capture: boolean;
  /** Rebased about the cut's origin, not this view's eye. */
  readonly vp: Float32Array;
  readonly viewportPx: Vec2;
  readonly pxPerRad: number;
  readonly sizePx: number;
  readonly brightness: number;
  readonly glowOverlap: number;
  readonly aggregateIntensityCap: number;
  readonly focus: StarFocusSphere;
  readonly viewSlot: number;
};
