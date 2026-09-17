/**
 * applyAlbedoRecipe — the pixel pipeline (design §8): de-shade, knee, keep
 * ice, grade. Pure and per-pixel; `sample` supplies the slope/`g`/latitude
 * a caller already knows how to look up (global lattices for the decorator,
 * a manual constant for the bench's preview), so this file owns none of
 * that lookup. `Y = 0` skips straight to `q = 1` — dividing a true black
 * pixel by itself would otherwise read back as `NaN`, not "unchanged".
 */
import { srgbToLinear } from '../color/srgbToLinear';
import { linearToSrgb } from '../color/linearToSrgb';
import type { AlbedoApply } from '../../textures/AlbedoApply';
import { gradeSrgb } from './gradeSrgb';
import { iceKeepWeight } from './iceKeepWeight';
import { kneeLuminance } from './kneeLuminance';

export function applyAlbedoRecipe(
  rgba: Uint8Array,
  width: number,
  height: number,
  sample: (
    px: number,
    py: number,
  ) => { sx: number; sy: number; gx: number; gy: number; latDeg: number },
  apply: AlbedoApply,
): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      out[i + 3] = rgba[i + 3]!;
      if (rgba[i + 3] === 0) {
        out[i] = rgba[i]!;
        out[i + 1] = rgba[i + 1]!;
        out[i + 2] = rgba[i + 2]!;
        continue;
      }

      const r = srgbToLinear(rgba[i]! / 255);
      const g = srgbToLinear(rgba[i + 1]! / 255);
      const b = srgbToLinear(rgba[i + 2]! / 255);
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      let q = 1;
      if (y !== 0) {
        const { sx, sy, gx, gy, latDeg } = sample(px, py);
        const y1 =
          y / Math.max(apply.deshade.minShading, 1 + apply.deshade.strength * (gx * sx + gy * sy));
        const y2 = kneeLuminance(y1, apply.knee.threshold, apply.knee.softness);
        const ratio = y2 / y;
        const max = Math.max(r, g, b);
        const whiteness = max > 0 ? Math.min(r, g, b) / max : 1;
        const w = iceKeepWeight(Math.abs(latDeg), whiteness, y, apply.ice);
        q = ratio + (1 - ratio) * w;
      }

      const srgb = gradeSrgb(
        [linearToSrgb(r * q), linearToSrgb(g * q), linearToSrgb(b * q)],
        apply.grade,
      );
      out[i] = Math.round(srgb[0] * 255);
      out[i + 1] = Math.round(srgb[1] * 255);
      out[i + 2] = Math.round(srgb[2] * 255);
    }
  }
  return out;
}
