/** compassTicks — the ribbon's ticks every 5° across `spanDeg` centred on a heading: numbers every 15°, letters every 45°. */

import type { CompassTick } from '../../@types/sky/CompassTick';

const TICK_DEG = 5;
const MAJOR_DEG = 15;
const LETTERS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function compassTicks(azimuthDeg: number, spanDeg: number): readonly CompassTick[] {
  const ticks: CompassTick[] = [];
  const first = Math.ceil((azimuthDeg - spanDeg / 2) / TICK_DEG) * TICK_DEG;
  for (let deg = first; deg <= azimuthDeg + spanDeg / 2; deg += TICK_DEG) {
    const bearing = ((deg % 360) + 360) % 360;
    const offset = (deg - azimuthDeg) / spanDeg + 0.5;
    const letter = bearing % 45 === 0 ? LETTERS[bearing / 45] : undefined;
    if (letter !== undefined) {
      const kind = letter.length === 1 ? 'cardinal' : 'intercardinal';
      ticks.push({ key: deg, offset, kind, label: letter });
    } else if (bearing % MAJOR_DEG === 0) {
      ticks.push({ key: deg, offset, kind: 'major', label: String(bearing) });
    } else {
      ticks.push({ key: deg, offset, kind: 'minor', label: null });
    }
  }
  return ticks;
}
