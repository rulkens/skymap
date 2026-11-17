import type { Vec3 } from '../../../../@types/math/Vec3';

/** What `pickMoonCraters` needs of this frame's view of the Moon. */
export type MoonCraterView = {
  /** The eye in the Moon's fixed axes, Moon radii. */
  readonly eye: Readonly<Vec3>;
  /** Moon-local unit sphere → clip, column-major. */
  readonly mvp: ArrayLike<number>;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Device px per radian at the view axis (`FrameView.drawPxPerRad`). */
  readonly pxPerRad: number;
  /** Device px per print unit. */
  readonly unitPx: number;
};
