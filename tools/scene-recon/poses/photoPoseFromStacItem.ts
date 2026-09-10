/**
 * photoPoseFromStacItem — one skråfoto STAC item's exterior + interior
 * orientation as a `PhotoPose` describing the **downsampled** JPEG
 * `fetchSkraafoto` wrote, not the full-resolution COG.
 *
 * `positionM` arrives already converted (`poses/topocentricPositionsM.ts`) so
 * this stays a pure function. The group's `headingDeg` is deliberately not
 * applied: `topocentricPositionsM` ignores it too, and the two must agree.
 */
import { matrixToQuaternion } from '../../../src/utils/math/matrixToQuaternion';
import type { GroupAnchor } from '../../scene-workbench/@types/GroupAnchor';
import type { PhotoPose } from '../../scene-workbench/@types/PhotoPose';
import type { SkraafotoStacItem } from '../@types/SkraafotoStacItem';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const DEG = Math.PI / 180;
/** Central meridian of EPSG:25832 (UTM zone 32N), degrees. */
const UTM32_CENTRAL_MERIDIAN_DEG = 9;

export function photoPoseFromStacItem(
  item: SkraafotoStacItem,
  anchor: GroupAnchor,
  positionM: Vec3,
  downsampleScale: number,
): PhotoPose {
  const props = item.properties;
  const io = props['pers:interior_orientation'];
  const [pixelSpacingXMm, pixelSpacingYMm] = io.pixel_spacing;
  const [principalOffsetXMm, principalOffsetYMm] = io.principal_point_offset;
  // `proj:shape` is STAC's [rows, cols] — height first. Same rounding as
  // fetchSkraafoto's `downsampledSize`, so the pose fits the JPEG on disk.
  const [rowsPx, colsPx] = props['proj:shape'];
  const imageWidthPx = Math.round(colsPx * downsampleScale);
  const imageHeightPx = Math.round(rowsPx * downsampleScale);

  const [co, so] = [Math.cos(props['pers:omega'] * DEG), Math.sin(props['pers:omega'] * DEG)];
  const [cp, sp] = [Math.cos(props['pers:phi'] * DEG), Math.sin(props['pers:phi'] * DEG)];
  const [ck, sk] = [Math.cos(props['pers:kappa'] * DEG), Math.sin(props['pers:kappa'] * DEG)];

  // Rows of the collinearity matrix — UTM-grid axes into photogrammetric image
  // axes (x right, y up, z toward the camera). This is the TRANSPOSE of
  // Rx(ω)·Ry(φ)·Rz(κ); the untransposed form makes every oblique frame look
  // north, which the items' own `direction` field disproves. Verified against
  // the fixture item's `pers:rotation_matrix` to nine decimals.
  const m: readonly Vec3[] = [
    [cp * ck, co * sk + so * sp * ck, so * sk - co * sp * ck],
    [-cp * sk, co * ck - so * sp * sk, so * ck + co * sp * sk],
    [sp, -so * cp, co * cp],
  ];

  // Grid convergence: ENU = Rz(-γ)·(UTM offset), so camera ← ENU folds Rz(γ)
  // in on the right. ≈2.9° at Søndermarken — 15 m of error at 300 m if dropped.
  const gamma = (anchor.lonDeg - UTM32_CENTRAL_MERIDIAN_DEG) * Math.sin(anchor.latDeg * DEG) * DEG;
  const [cg, sg] = [Math.cos(gamma), Math.sin(gamma)];

  // One camera ← group row. `sign` negates rows 1 and 2: photogrammetric image
  // y points up and z back, the CV camera frame wants y down, z forward.
  const row = ([a, b, c]: Vec3, sign: number): Vec3 => [
    sign * (a * cg + b * sg),
    sign * (b * cg - a * sg),
    sign * c,
  ];

  // PhotoPose.rotation is the inverse (group ← camera) and matrixToQuaternion
  // reads column-major, so those camera ← group rows are already its columns.
  const groupFromCam: Mat3 = [...row(m[0]!, 1), ...row(m[1]!, -1), ...row(m[2]!, -1)];

  return {
    id: item.id,
    positionM,
    rotation: matrixToQuaternion(groupFromCam),
    focalLengthPx: (io.focal_length / pixelSpacingXMm) * downsampleScale,
    principalPointPx: [
      imageWidthPx / 2 + (principalOffsetXMm / pixelSpacingXMm) * downsampleScale,
      // SDFI defines ppo_y y-UP from the centre (image origin lower-left); these are
      // y-down pixels: github.com/SDFIdk/skraafoto_stac_public/blob/main/dokumentation.md
      imageHeightPx / 2 - (principalOffsetYMm / pixelSpacingYMm) * downsampleScale,
    ],
    imageWidthPx,
    imageHeightPx,
    imageUrl: `${item.id}.jpg`,
  };
}
