/**
 * Galaxy octree records as `points/pooledVertex.wesl` reads them: six u32 per record, every
 * per-galaxy derivation run here through `derivePointRecord` (the flat interleave's own helper),
 * so the shader only decodes. The u8 fields are the wire codes again: the columns hold
 * `q0 + code·q1`, so re-quantising with the header schema is exact.
 *   w0 x | y << 16 · w1 z | absMag << 16 | colourIndex << 24
 *   w2 axisRatio | angularWeight << 8 | flags << 16 · w3 paCos f16 | paSin f16 << 16
 *   w4 magnitude f16 | sbAmp f16 << 16 · w5 padded radius f32 (sign = diameter fallback)
 */
import type { GalaxyColumns } from '../../@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyPointDerived } from '../../@types/engine/GalaxyPointDerived';
import type { GalaxyPointFields } from '../../@types/engine/GalaxyPointFields';
import type { GalaxyPointStats } from '../../@types/engine/GalaxyPointStats';
import type { ColumnId } from '../../@types/octree/ColumnId';
import type { Octree } from '../../@types/octree/Octree';
import type { OctreeNodeTable } from '../../@types/octree/OctreeNodeTable';
import type { Vec3 } from '../../@types/math/Vec3';
import { GALAXY_GPU_RECORD_WORDS } from '../../data/galaxyCatalog/galaxyGpuRecordWords';
import { OFFSET_FRACTION_LEVELS } from '../../data/octree/octreeFormat';
import { apparentFromAbsolute } from '../math/apparentFromAbsolute';
import { f32ToF16Bits } from '../math/f32ToF16Bits';
import { octreeNodeOriginRelCamMpc } from '../octree/octreeNodeOriginRelCamMpc';
import { derivePointRecord } from './derivePointRecord';

const ORIGIN: Vec3 = [0, 0, 0];
const FLAG_ORIENTATION_FALLBACK = 1;
const FLAG_DIAMETER_FALLBACK = 2;
const HALF_SHIFT = 16;
const ABS_MAG_SHIFT = 16;
const COLOUR_SHIFT = 24;
const WEIGHT_SHIFT = 8;
const FLAGS_SHIFT = 16;

export function packGalaxyGpuRecords(
  object: { readonly nodes: OctreeNodeTable; readonly records: GalaxyColumns },
  octree: Pick<Octree<GalaxyColumns>, 'family' | 'grid' | 'columns'>,
  stats: GalaxyPointStats,
  out: Uint32Array,
  at: number,
): void {
  const { nodes, records } = object;
  const outF32 = new Float32Array(out.buffer, out.byteOffset, out.length);
  const codeOf = (id: ColumnId): ((v: number) => number) => {
    const c = octree.columns.find((s) => s.id === id);
    if (c === undefined) throw new Error(`packGalaxyGpuRecords: schema lacks ${id}`);
    return (v) => Math.round((v - c.q0) / c.q1) & 0xff;
  };
  const absMagCode = codeOf('absMag');
  const colourCode = codeOf('colourIndex');
  const axisRatioCode = codeOf('axisRatio');
  const weightCode = codeOf('angularWeight');
  const flagsCode = codeOf('flags');

  const f: GalaxyPointFields = {
    x: 0,
    y: 0,
    z: 0,
    magnitude: 0,
    axisRatio: 0,
    positionAngleDeg: 0,
    diameterKpc: 0,
    orientationIsFallback: false,
    diameterIsFallback: false,
  };
  const d: GalaxyPointDerived = {
    magnitude: 0,
    axisRatio: 0,
    paCos: 0,
    paSin: 0,
    radiusMpc: 0,
    absMag: 0,
    sbAmp: 0,
  };

  for (let row = 0; row < nodes.count; row++) {
    const first = nodes.firstRecord[row]!;
    // The blob, when the row has children, follows its own records.
    const end = first + nodes.ownCount[row]! + (nodes.childMask[row] !== 0 ? 1 : 0);
    if (end === first) continue;
    const { originRelCamMpc: o, cellScaleMpc } = octreeNodeOriginRelCamMpc(
      octree.grid,
      octree.family,
      nodes.morton[row]!,
      nodes.level[row]!,
      ORIGIN,
    );
    const scale = cellScaleMpc / OFFSET_FRACTION_LEVELS;
    for (let r = first; r < end; r++) {
      const ox = records.offset[3 * r]!;
      const oy = records.offset[3 * r + 1]!;
      const oz = records.offset[3 * r + 2]!;
      f.x = o[0] + ox * scale;
      f.y = o[1] + oy * scale;
      f.z = o[2] + oz * scale;
      const absMag = records.absMag[r]!;
      // The emitter baked absMag from the offset magnitude; undo both steps to get the raw band.
      f.magnitude = apparentFromAbsolute(absMag, Math.hypot(f.x, f.y, f.z)) - stats.magOffset;
      f.axisRatio = records.axisRatio[r]!;
      f.positionAngleDeg = records.pa[r]!;
      f.diameterKpc = 10 ** records.logSize[r]!;
      const flags = flagsCode(records.flags[r]!);
      f.orientationIsFallback = (flags & FLAG_ORIENTATION_FALLBACK) !== 0;
      f.diameterIsFallback = (flags & FLAG_DIAMETER_FALLBACK) !== 0;
      derivePointRecord(f, stats, d);

      const w = (at + r) * GALAXY_GPU_RECORD_WORDS;
      out[w] = ox | (oy << HALF_SHIFT);
      out[w + 1] =
        oz |
        (absMagCode(absMag) << ABS_MAG_SHIFT) |
        (colourCode(records.colourIndex[r]!) << COLOUR_SHIFT);
      out[w + 2] =
        axisRatioCode(f.axisRatio) |
        (weightCode(records.angularWeight[r]!) << WEIGHT_SHIFT) |
        (flags << FLAGS_SHIFT);
      out[w + 3] = f32ToF16Bits(d.paCos) | (f32ToF16Bits(d.paSin) << HALF_SHIFT);
      out[w + 4] = f32ToF16Bits(d.magnitude) | (f32ToF16Bits(d.sbAmp) << HALF_SHIFT);
      outF32[w + 5] = d.radiusMpc;
    }
  }
}
