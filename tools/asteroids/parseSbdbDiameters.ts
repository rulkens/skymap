import type { AsteroidDiameterRow } from '../@types/asteroids/AsteroidDiameterRow';
import type { SbdbQueryAnswer } from '../@types/asteroids/SbdbQueryAnswer';

/**
 * parseSbdbDiameters — the SBDB answer's rows as numbers. Columns are found by field name, so a reordered
 * `fields` list cannot swap diameter and albedo; a row without a positive diameter or an integer number
 * fails the bake rather than shipping a size the card would print.
 */
export function parseSbdbDiameters(answer: SbdbQueryAnswer): AsteroidDiameterRow[] {
  const column = (name: string): number => {
    const at = answer.fields.indexOf(name);
    if (at < 0) throw new Error(`parseSbdbDiameters: no "${name}" field`);
    return at;
  };
  const [pdes, diameter, albedo] = [column('pdes'), column('diameter'), column('albedo')];
  return answer.data.map((row) => {
    const number = Number(row[pdes]);
    const diameterKm = Number(row[diameter]);
    if (!Number.isInteger(number) || number < 1 || !(diameterKm > 0)) {
      throw new Error(`parseSbdbDiameters: bad row ${JSON.stringify(row)}`);
    }
    const a = row[albedo];
    return { number, diameterKm, albedo: a === null || a === undefined ? null : Number(a) };
  });
}
