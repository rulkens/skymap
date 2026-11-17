import type { StellarStreamMeta } from '../../catalog/@types/StellarStreamMeta';
import type { StellarStreamRibbons } from '../@types/StellarStreamRibbons';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { STELLAR_STREAM_RIBBON_RECORD_LANES as LANES } from '../data/stellarStreamRibbonRecord.constants';

/** One pick-ribbon segment per pair of consecutive centreline points, each naming its stream. */
export function stellarStreamRibbons(meta: readonly StellarStreamMeta[]): StellarStreamRibbons {
  const total = meta.reduce((n, m) => n + Math.max(0, m.centrelineMpc.length - 1), 0);
  const records = new ArrayBuffer(total * LANES * 4);
  const f32 = new Float32Array(records);
  const u32 = new Uint32Array(records);
  let first = 0;
  const ranges = meta.map((m, stream) => {
    const count = Math.max(0, m.centrelineMpc.length - 1);
    for (let i = 0; i < count; i++) {
      const r = (first + i) * LANES;
      f32.set(m.centrelineMpc[i]!, r);
      f32.set(m.centrelineMpc[i + 1]!, r + 3);
      f32[r + 6] = (m.ribbonWidthKpc / 2) * SCALE_UNITS.KPC_TO_MPC;
      u32[r + 7] = stream;
    }
    const range = { first, count };
    first += count;
    return range;
  });
  return { records, ranges };
}
