import type { HexString } from '../../@types/math/HexString';
import { hexToGl } from '../color/hexToGl';
import { svgNumber as f } from './svgNumber';

/**
 * An SVG filter painting paper noise as a colour ramp through the paper's own `ground`:
 * at mid noise it is the ground itself, darker noise leans to `tone`, lighter to
 * bleached paper, up to `strength`. The sheet keeps its mean tone, and with it the
 * ink's contrast, however strong the texture. `stitch` makes a `size` tile seamless.
 */
export function paperNoiseFilter(
  id: string,
  frequency: string,
  seed: number,
  size: number,
  ground: HexString,
  tone: HexString,
  strength: number,
  stitch: boolean,
): string {
  const g = hexToGl(ground);
  const t = hexToGl(tone);
  const rows = [0, 1, 2]
    .map((i) => `${f(2 * (t[i]! - g[i]!))} 0 0 0 ${f(2 * g[i]! - t[i]!)}`)
    .join(' ');
  return (
    `<filter id="${id}" x="0" y="0" width="${size}" height="${size}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="3" seed="${seed}"${stitch ? ' stitchTiles="stitch"' : ''}/>` +
    `<feColorMatrix type="matrix" values="${rows} 0 0 0 0 ${f(strength)}"/></filter>`
  );
}
