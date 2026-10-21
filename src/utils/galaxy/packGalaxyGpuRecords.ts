/**
 * Galaxy octree records as `points/pooledVertex.wesl` reads them: four u32 per record, the
 * wire codes bit-copied so the shader derives the point fields itself (`pooledFields.wesl`),
 * as the star records do. The columns hold `q0 + code·q1`, so re-quantising with the header
 * schema is exact.
 *   w0 x | y << 16 · w1 z | absMag << 16 | colourIndex << 24
 *   w2 axisRatio | angularWeight << 8 | flags << 16 | pa << 24 · w3 logSize
 */
import type { GalaxyColumns } from '../../@types/data/galaxyCatalog/GalaxyColumns';
import type { ColumnId } from '../../@types/octree/ColumnId';
import type { ColumnSchema } from '../../@types/octree/ColumnSchema';
import { GALAXY_GPU_RECORD_WORDS } from '../../data/galaxyCatalog/galaxyGpuRecordWords';

const Y_SHIFT = 16;
const ABS_MAG_SHIFT = 16;
const COLOUR_SHIFT = 24;
const WEIGHT_SHIFT = 8;
const FLAGS_SHIFT = 16;
const PA_SHIFT = 24;
const BYTE_MASK = 0xff;

export function packGalaxyGpuRecords(
  records: GalaxyColumns,
  columns: readonly ColumnSchema[],
  out: Uint32Array,
  at: number,
): void {
  const schemaOf = (id: ColumnId): ColumnSchema => {
    const c = columns.find((s) => s.id === id);
    if (c === undefined) throw new Error(`packGalaxyGpuRecords: schema lacks ${id}`);
    return c;
  };
  const code = (v: number, { q0, q1 }: ColumnSchema): number =>
    Math.round((v - q0) / q1) & BYTE_MASK;
  const absMagQ = schemaOf('absMag');
  const colourQ = schemaOf('colourIndex');
  const axisRatioQ = schemaOf('axisRatio');
  const weightQ = schemaOf('angularWeight');
  const flagsQ = schemaOf('flags');
  const paQ = schemaOf('pa');
  const logSizeQ = schemaOf('logSize');
  const { count, offset, absMag, colourIndex, axisRatio, angularWeight, flags, pa, logSize } =
    records;

  for (let r = 0; r < count; r++) {
    const w = (at + r) * GALAXY_GPU_RECORD_WORDS;
    out[w] = offset[3 * r]! | (offset[3 * r + 1]! << Y_SHIFT);
    out[w + 1] =
      offset[3 * r + 2]! |
      (code(absMag[r]!, absMagQ) << ABS_MAG_SHIFT) |
      (code(colourIndex[r]!, colourQ) << COLOUR_SHIFT);
    out[w + 2] =
      code(axisRatio[r]!, axisRatioQ) |
      (code(angularWeight[r]!, weightQ) << WEIGHT_SHIFT) |
      (code(flags[r]!, flagsQ) << FLAGS_SHIFT) |
      (code(pa[r]!, paQ) << PA_SHIFT);
    out[w + 3] = code(logSize[r]!, logSizeQ);
  }
}
