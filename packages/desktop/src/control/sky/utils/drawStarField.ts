import type { StarField } from '../../../../../website/src/@types/StarField';
import { CONTROL_SKY as S } from '../data/controlSky';
import { starFade } from './starFade';

/** Paints `field` still across a width × height canvas in CSS px, faded away from the boxes. */
export function drawStarField(
  g: CanvasRenderingContext2D,
  field: StarField,
  sprites: readonly CanvasImageSource[],
  width: number,
  height: number,
  boxes: readonly number[],
): void {
  g.clearRect(0, 0, width, height);
  const scale = Math.max(S.minPxPerDeg, width / S.degAcross);
  const loop = 360 * scale;
  for (let i = 0; i < field.mag.length; i++) {
    const t = Math.min(1, Math.max(0, (S.magFaint - field.mag[i]!) / (S.magFaint - S.magBright)));
    const r = (S.radius[0] + (S.radius[1] - S.radius[0]) * t ** 2.5) / S.core;
    const x = width / 2 - field.across[i]! * scale;
    let y = (field.along[i]! * scale + height / 2) % loop;
    if (y > height + r) y -= loop;
    if (x < -r || x > width + r || y < -r || y > height + r) continue;
    const fade = starFade(x, y, boxes, S.pad, S.feather);
    if (fade === 0) continue;
    g.globalAlpha = (S.alpha[0] + (S.alpha[1] - S.alpha[0]) * t) * fade;
    g.drawImage(sprites[field.tint[i]!]!, x - r, y - r, 2 * r, 2 * r);
  }
  g.globalAlpha = 1;
}
