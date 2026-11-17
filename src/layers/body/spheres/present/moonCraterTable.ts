import type { MoonCraterTable } from '../@types/MoonCraterTable';

/** The baked rows (lat°, east lon°, crest radius km, weight) as unit vectors and arcs,
 * once, so the per-frame pick does no trigonometry. */
export function moonCraterTable(rows: readonly number[], moonRadiusKm: number): MoonCraterTable {
  const count = rows.length / 4;
  const centres = new Float32Array(count * 3);
  const rho = new Float32Array(count);
  const weight = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const lat = (rows[4 * i]! * Math.PI) / 180;
    const lon = (rows[4 * i + 1]! * Math.PI) / 180;
    centres[3 * i] = Math.cos(lat) * Math.cos(lon);
    centres[3 * i + 1] = Math.cos(lat) * Math.sin(lon);
    centres[3 * i + 2] = Math.sin(lat);
    rho[i] = rows[4 * i + 2]! / moonRadiusKm;
    weight[i] = rows[4 * i + 3]!;
  }
  return { count, centres, rho, weight };
}
