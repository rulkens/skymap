/** gradeSrgb — the bench's perceptual grade, applied in sRGB-encoded space
 *  so exposure/contrast/saturation read the way a photo editor's do (design
 *  §8 step 6). Saturation blends toward Rec. 709 luma computed AFTER
 *  exposure/gain/offset/contrast, so it grades the graded image, not the
 *  original. */
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { AlbedoRecipe } from '../../textures/AlbedoRecipe';

export function gradeSrgb(rgb: Readonly<Vec3>, grade: AlbedoRecipe['grade']): Readonly<Vec3> {
  const evScale = Math.pow(2, grade.exposureEv);
  const exposed: Vec3 = [
    rgb[0] * evScale * grade.gain[0] + grade.offset[0],
    rgb[1] * evScale * grade.gain[1] + grade.offset[1],
    rgb[2] * evScale * grade.gain[2] + grade.offset[2],
  ];
  const contrasted: Vec3 = [
    (exposed[0] - 0.5) * grade.contrast + 0.5,
    (exposed[1] - 0.5) * grade.contrast + 0.5,
    (exposed[2] - 0.5) * grade.contrast + 0.5,
  ];
  const luma = 0.2126 * contrasted[0] + 0.7152 * contrasted[1] + 0.0722 * contrasted[2];
  const saturated: Vec3 = [
    luma + (contrasted[0] - luma) * grade.saturation,
    luma + (contrasted[1] - luma) * grade.saturation,
    luma + (contrasted[2] - luma) * grade.saturation,
  ];
  return saturated.map((v) =>
    Math.min(1, Math.max(0, Math.pow(Math.max(0, v), 1 / grade.gamma))),
  ) as Vec3;
}
