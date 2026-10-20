/**
 * buildGladeOctree — GLADE's galaxy octree beside its flat tier files: render columns through the
 * shared stratify/chunk bake, CPU-only info columns and pgc shards from the parser's own arrays
 * (a pgc does not fit the f32 columns). Positions are Earth-centred Mpc, unit 1.
 */
import fs from 'node:fs';
import { join } from 'node:path';

import type { ColumnId } from '../../src/@types/octree/ColumnId';
import type { GalaxyCatalog } from '../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { OctreeIndexHeader } from '../../src/@types/octree/OctreeIndexHeader';
import type { GladeOctreeOptions } from '../@types/catalog/GladeOctreeOptions';
import type { OctreeCatalogMeta } from '../@types/octree/OctreeCatalogMeta';
import { GLADE_STRATIFY } from '../../src/data/galaxyCatalog/gladeStratify';
import { pickColourIndex } from '../../src/data/galaxyCatalog/colourIndex';
import {
  GALAXY_COLUMN_SCHEMA,
  GALAXY_INFO_SCHEMA,
  GALAXY_OCTREE_FAMILY,
} from '../../src/data/octree/galaxyOctreeFamily';
import { Source } from '../../src/data/sources';
import { countEstimatedProvenance } from '../../src/utils/countEstimatedProvenance';
import { galaxyMagOffset } from '../../src/utils/galaxy/galaxyMagOffset';
import { galaxyMedianAbsMag } from '../../src/utils/galaxy/galaxyMedianAbsMag';
import { absoluteFromApparent } from '../../src/utils/math/absoluteFromApparent';
import { buildOctreeCatalog } from '../octree/buildOctreeCatalog';
import { deriveOctreeGrid } from '../octree/deriveOctreeGrid';
import { writeOctreeCatalog } from '../octree/writeOctreeCatalog';
import { bakeBiasWeights } from './bias/bakeBiasWeights';
import { buildGladeShards } from './buildGladeShards';

export const GLADE_CATALOG_NAME = 'glade';

/** Morton bits per axis: 10 keeps a key inside a u32 (30 bits). */
const MORTON_BITS = 10;
/** The byte-55 codec's range; `w = 0` (vmax) would otherwise bake as "never baked" and poison blob means. */
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 10;
const FLAG_ORIENTATION_FALLBACK = 1;
const FLAG_DIAMETER_FALLBACK = 2;

export function buildGladeOctree(
  cloud: GalaxyCatalog,
  options: GladeOctreeOptions,
): OctreeIndexHeader {
  const n = cloud.count;
  const magOffset = galaxyMagOffset(cloud);
  const grid = deriveOctreeGrid(cloud.positions, MORTON_BITS);
  const positions = new Float64Array(n * 3);
  const absMag = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++)
      positions[3 * i + a] = cloud.positions[3 * i + a]! - grid.origin[a]!;
    const d = Math.hypot(
      cloud.positions[3 * i]!,
      cloud.positions[3 * i + 1]!,
      cloud.positions[3 * i + 2]!,
    );
    absMag[i] = absoluteFromApparent(cloud.magG[i]! + magOffset, d);
  }
  // A record with no usable magnitude draws at the faintest end of the catalog's range.
  let lo = Infinity;
  let hi = -Infinity;
  for (const m of absMag) {
    if (m < lo) lo = m;
    if (m > hi) hi = m;
  }
  if (!(lo <= hi)) lo = hi = 0;
  absMag.forEach((m, i) => {
    if (!Number.isFinite(m)) absMag[i] = hi;
  });

  const weights =
    options.biasWeight === 'none' ? null : bakeBiasWeights(cloud, Source.Glade, options.biasWeight);
  const colourIndex = new Float32Array(n);
  const pa = new Float32Array(n);
  const logSize = new Float32Array(n);
  const flags = new Float32Array(n);
  const angularWeight = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(
      cloud.positions[3 * i]!,
      cloud.positions[3 * i + 1]!,
      cloud.positions[3 * i + 2]!,
    );
    colourIndex[i] = pickColourIndex(
      Source.Glade,
      cloud.magU[i]!,
      cloud.magG[i]!,
      cloud.magR[i]!,
      cloud.magI[i]!,
      cloud.magZ[i]!,
      d,
    );
    pa[i] = ((cloud.positionAngleDeg[i]! % 180) + 180) % 180 || 0;
    logSize[i] = Math.log10(cloud.diameterKpc[i]!);
    flags[i] =
      (cloud.orientationIsFallback[i] ? FLAG_ORIENTATION_FALLBACK : 0) |
      (cloud.diameterIsFallback[i] ? FLAG_DIAMETER_FALLBACK : 0);
    if (weights)
      angularWeight[i] = Math.log10(Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, weights[i]!)));
  }

  const schema = GALAXY_COLUMN_SCHEMA.map((c) =>
    c.id === 'absMag' ? { ...c, q0: lo, q1: hi > lo ? (hi - lo) / 255 : 1 } : c,
  );
  const objects = buildOctreeCatalog({
    grid,
    stratify: GLADE_STRATIFY,
    positions,
    magnitudeColumn: 'absMag',
    columns: new Map<ColumnId, Float32Array>([
      ['absMag', absMag],
      ['colourIndex', colourIndex],
      ['axisRatio', cloud.axisRatio],
      ['pa', pa],
      ['logSize', logSize],
      ['flags', flags],
      ['angularWeight', angularWeight],
    ]),
    schema,
  });

  const { shards, firstPgcs } = buildGladeShards(objects, cloud.objIDs);
  const present = new Set<number>();
  for (const id of cloud.objIDs) if (id > 0n) present.add(Number(id));
  const provenance = countEstimatedProvenance(cloud).estimated;
  const meta: OctreeCatalogMeta = {
    family: 'galaxy',
    grid,
    stratify: GLADE_STRATIFY,
    schema,
    stats: {
      recordCount: n,
      medianAbsMag: galaxyMedianAbsMag(cloud),
      magOffset,
      orientationEstimated: provenance.orientation,
      diameterEstimated: provenance.size,
    },
    pgcShards: firstPgcs,
    namedPgcs: options.aliasPgcs.filter((p) => present.has(p)).sort((a, b) => a - b),
  };

  const outDir = join(options.outDir, GALAXY_OCTREE_FAMILY.dataPrefix);
  fs.mkdirSync(outDir, { recursive: true });
  shards.forEach((bytes, k) =>
    fs.writeFileSync(join(outDir, `${GLADE_CATALOG_NAME}.pgc-${k}.bin`), bytes),
  );
  return writeOctreeCatalog(objects, meta, outDir, GLADE_CATALOG_NAME, {
    schema: GALAXY_INFO_SCHEMA,
    columns: new Map<ColumnId, Float32Array | BigUint64Array>([
      ['objId', cloud.objIDs],
      ['specZ', cloud.spectroscopicZ],
      ['logMass', cloud.log10StellarMass],
      ['magU', cloud.magU],
      ['magG', cloud.magG],
      ['magR', cloud.magR],
      ['magI', cloud.magI],
      ['magZ', cloud.magZ],
    ]),
  });
}
