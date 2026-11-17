import { CONTROL_SKY } from '../data/controlSky';

/** A soft round star in one '#rrggbb' colour, drawn once and scaled for every star of that tint. */
export function starSprite(colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const glow = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, colour);
  glow.addColorStop(CONTROL_SKY.core * 0.75, colour);
  glow.addColorStop(CONTROL_SKY.core * 1.25, `${colour}40`);
  glow.addColorStop(1, `${colour}00`);
  g.fillStyle = glow;
  g.fillRect(0, 0, 32, 32);
  return c;
}
