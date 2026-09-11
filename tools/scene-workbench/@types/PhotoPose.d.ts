/**
 * PhotoPose — one photograph's recovered camera, in a scene group's local
 * metre frame. `bakeSplats` writes these into COLMAP's `cameras.txt` /
 * `images.txt` to seed Brush; nothing renders them in v1.
 */
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../src/@types/math/Vec4';

export type PhotoPose = {
  readonly id: string;
  /** Camera centre in the group frame, metres. */
  readonly positionM: Vec3;
  /** Group frame ← camera frame (camera looks along +Z, +Y down — the CV convention). */
  readonly rotation: Vec4;
  readonly focalLengthPx: number;
  readonly principalPointPx: Vec2;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly imageUrl: string;
};
