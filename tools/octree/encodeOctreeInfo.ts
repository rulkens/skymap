import type { ColumnSchema } from '../../src/@types/octree/ColumnSchema';
import type { OctreeInfoInput } from '../@types/octree/OctreeInfoInput';
import type { OctreeRawColumn } from '../@types/octree/OctreeRawColumn';
import { encodeOctreeObject } from './encodeOctreeObject';
import { NO_SOURCE_ROW } from './noSourceRow';
import { quantiseColumn } from './quantiseColumn';

/**
 * One render object's info object: each column read from the caller's arrays through
 * `sourceRows`. A blob row is raw 0 (objId 0n) or NaN before quantising, and NaN quantises to raw
 * 0 in an integer store (typed-array conversion), so logMass reads as absent.
 */
export function encodeOctreeInfo(info: OctreeInfoInput, sourceRows: Uint32Array): Uint8Array {
  const raw = new Map(info.schema.map((c) => [c.id, gatherColumn(info, c, sourceRows)]));
  const header = { kind: 'info', records: sourceRows.length, columns: info.schema } as const;
  return encodeOctreeObject(header, null, info.schema, raw);
}

function gatherColumn(info: OctreeInfoInput, c: ColumnSchema, rows: Uint32Array): OctreeRawColumn {
  const values = info.columns.get(c.id);
  if (values === undefined) throw new Error(`info column '${c.id}' has no input values`);
  const n = rows.length;
  if (values instanceof BigUint64Array !== (c.store === 'u64'))
    throw new Error(`info column '${c.id}': BigUint64Array values need a u64 store, and only they`);
  if (values instanceof Uint8Array && c.store !== 'u8')
    throw new Error(`info column '${c.id}': raw Uint8Array values need a u8 store`);
  if (values instanceof BigUint64Array) {
    const out = new BigUint64Array(n);
    for (let i = 0; i < n; i++) if (rows[i] !== NO_SOURCE_ROW) out[i] = values[rows[i]!]!;
    return out;
  }
  if (values instanceof Uint8Array) {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (rows[i] !== NO_SOURCE_ROW) out[i] = values[rows[i]!]!;
    return out;
  }
  const out = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i++) if (rows[i] !== NO_SOURCE_ROW) out[i] = values[rows[i]!]!;
  return quantiseColumn(out, c);
}
