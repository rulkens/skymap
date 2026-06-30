import type { Vec2 } from '../math/Vec2';

/** Disk render frame: the size/tilt/nucleus the textured quad is emitted with. */
export type DiskPlacement = {
  readonly sizeWorld: number;
  readonly axisRatio: number;
  readonly positionAngleDeg: number;
  readonly nucleusOffset: Vec2;
};
