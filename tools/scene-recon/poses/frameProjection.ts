/**
 * frameProjection — one skråfoto frame's collinearity in **native** COG pixels:
 * the camera ← group rotation plus the full-resolution intrinsics.
 *
 * Shared by `photoPoseFromStacItem` (which rescales it onto the JPEG actually
 * written) and `frameWindow` (which projects the group's bounds box through it
 * to find the crop). The sign conventions here are pinned by
 * `photoPoseFromStacItem`'s oblique fixture test — a transposed matrix still
 * looks right on a nadir frame and swings ~90° of azimuth on an oblique one.
 */
import type { GroupAnchor } from '../../scene-workbench/@types/GroupAnchor';
import type { SkraafotoStacItem } from '../@types/SkraafotoStacItem';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const DEG = Math.PI / 180;
/** Central meridian of EPSG:25832 (UTM zone 32N), degrees. */
const UTM32_CENTRAL_MERIDIAN_DEG = 9;

export type FrameProjection = {
  /** Rows of camera ← group (CV frame: x right, y down, z forward). */
  readonly camFromGroup: readonly [Vec3, Vec3, Vec3];
  readonly focalLengthPx: number;
  /** y-down from the frame's top-left corner. */
  readonly principalPointPx: readonly [number, number];
  readonly widthPx: number;
  readonly heightPx: number;
};

export function frameProjection(item: SkraafotoStacItem, anchor: GroupAnchor): FrameProjection {
  const props = item.properties;
  const io = props['pers:interior_orientation'];
  const [pixelSpacingXMm, pixelSpacingYMm] = io.pixel_spacing;
  const [principalOffsetXMm, principalOffsetYMm] = io.principal_point_offset;
  // `proj:shape` is STAC's [rows, cols] — height first.
  const [heightPx, widthPx] = props['proj:shape'];

  const [co, so] = [Math.cos(props['pers:omega'] * DEG), Math.sin(props['pers:omega'] * DEG)];
  const [cp, sp] = [Math.cos(props['pers:phi'] * DEG), Math.sin(props['pers:phi'] * DEG)];
  const [ck, sk] = [Math.cos(props['pers:kappa'] * DEG), Math.sin(props['pers:kappa'] * DEG)];

  // Rows of the collinearity matrix — UTM-grid axes into photogrammetric image
  // axes (x right, y up, z toward the camera). This is the TRANSPOSE of
  // Rx(ω)·Ry(φ)·Rz(κ); the untransposed form makes every oblique frame look
  // north, which the items' own `direction` field disproves; matched the live
  // item's `pers:rotation_matrix`.
  const m: readonly Vec3[] = [
    [cp * ck, co * sk + so * sp * ck, so * sk - co * sp * ck],
    [-cp * sk, co * ck - so * sp * sk, so * ck + co * sp * sk],
    [sp, -so * cp, co * cp],
  ];

  // Grid convergence: ENU = Rz(-γ)·(UTM offset), so camera ← ENU folds Rz(γ)
  // in on the right. ≈2.9° at Søndermarken — 15 m of error at 300 m if dropped.
  const gamma = (anchor.lonDeg - UTM32_CENTRAL_MERIDIAN_DEG) * Math.sin(anchor.latDeg * DEG) * DEG;
  const [cg, sg] = [Math.cos(gamma), Math.sin(gamma)];

  // `sign` negates rows 1 and 2: photogrammetric image y points up and z back,
  // the CV camera frame wants y down, z forward.
  const row = ([a, b, c]: Vec3, sign: number): Vec3 => [
    sign * (a * cg + b * sg),
    sign * (b * cg - a * sg),
    sign * c,
  ];

  return {
    camFromGroup: [row(m[0]!, 1), row(m[1]!, -1), row(m[2]!, -1)],
    focalLengthPx: io.focal_length / pixelSpacingXMm,
    principalPointPx: [
      widthPx / 2 + principalOffsetXMm / pixelSpacingXMm,
      // SDFI defines ppo_y y-UP from the centre (image origin lower-left); these are
      // y-down pixels: github.com/SDFIdk/skraafoto_stac_public/blob/main/dokumentation.md
      heightPx / 2 - principalOffsetYMm / pixelSpacingYMm,
    ],
    widthPx,
    heightPx,
  };
}

/** A group-frame point in native frame pixels, or `null` behind the camera. */
export function projectToFramePx(
  projection: FrameProjection,
  cameraPositionM: Vec3,
  pointM: Vec3,
): readonly [number, number] | null {
  const d: Vec3 = [
    pointM[0] - cameraPositionM[0],
    pointM[1] - cameraPositionM[1],
    pointM[2] - cameraPositionM[2],
  ];
  const [rx, ry, rz] = projection.camFromGroup;
  const z = rz[0] * d[0] + rz[1] * d[1] + rz[2] * d[2];
  if (!(z > 0)) return null;
  const x = rx[0] * d[0] + rx[1] * d[1] + rx[2] * d[2];
  const y = ry[0] * d[0] + ry[1] * d[1] + ry[2] * d[2];
  return [
    projection.principalPointPx[0] + (projection.focalLengthPx * x) / z,
    projection.principalPointPx[1] + (projection.focalLengthPx * y) / z,
  ];
}
