import type { CSSProperties } from 'react';

import type { GalleryView } from '../@types/GalleryView';
import type { MeteorStreak } from '../@types/MeteorStreak';
import { randomBetween } from './randomBetween.ts';

// A random place and angle whose whole path, head to head, lies in the sky; null when no try fits.
export function plotMeteor(
  sky: NonNullable<GalleryView['sky']>,
  box: DOMRect,
  id: number,
  at: number,
): MeteorStreak | null {
  // A floor, so a phone's band still shows a streak and not a speck.
  const length = Math.max(box.width * randomBetween(0.05, 0.09), 28);
  const travel = length * randomBetween(1.4, 2);
  const inSky = (x: number, y: number) =>
    x >= sky.left * box.width &&
    x <= sky.right * box.width &&
    y >= sky.top * box.height &&
    y <= sky.bottom * box.height;
  for (let i = 0; i < 12; i++) {
    const angle = randomBetween(0, 2 * Math.PI);
    const x = box.width * randomBetween(sky.left, sky.right);
    const y = box.height * randomBetween(sky.top, sky.bottom);
    if (!inSky(x + travel * Math.cos(angle), y + travel * Math.sin(angle))) continue;
    return {
      id,
      at,
      style: {
        left: x - length,
        top: y,
        width: length,
        '--angle': `${angle}rad`,
        '--travel': `${travel}px`,
        '--duration': `${Math.round(randomBetween(550, 850))}ms`,
      } as CSSProperties,
    };
  }
  return null;
}
