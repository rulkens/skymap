import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';

/** Per-gesture, latched at gesture start, dead at pointerup (ruled, Q3). */
export type SurfaceGesture = {
  readonly mode: 'pan' | 'orbit' | 'strafe' | 'look' | 'tilt';
  /** |first pick| — the FROZEN pan sphere, body-fixed metres (C §2.3, §6.2). */
  readonly anchorRadiusM: number;
  /** Body-fixed, never world (C landmine #5). */
  readonly anchorLocalM: Vec3 | null;
  /** Previous FRAME's end pixel, not the press point (C §2.1). */
  readonly prevPixel: Vec2;
};
