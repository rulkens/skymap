/**
 * octreeGalaxyRecordSource — the record contract over a galaxy octree. An ordinal is a
 * record's place in pool order, blobs included (D7), so a blob answers no row. The index's
 * records are always at hand; any other record's row, a pgc and a position fetch first
 * (the chunk's render + info pair, a pgc shard), so those lookups return promises the
 * record bridge defers on. Only `namedPgcs` answers `hasDurableId`: the palette asks it
 * synchronously, and the shards are not loaded to answer it.
 */
import type { GalaxyCatalogRegistryEntry } from '../../../@types/data/galaxyCatalog/GalaxyCatalogRegistryEntry';
import type { GalaxyColumnBlock } from '../../../@types/data/galaxyCatalog/GalaxyColumnBlock';
import type { GalaxyOctreeObject } from '../../../@types/data/galaxyCatalog/GalaxyOctreeObject';
import type { GalaxyRecordSource } from '../../../@types/data/galaxyCatalog/GalaxyRecordSource';
import type { GalaxyRow } from '../../../@types/engine/GalaxyRow';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { ColumnId } from '../../../@types/octree/ColumnId';
import type { OctreeChunkRef } from '../../../@types/octree/OctreeChunkRef';
import type { OctreeColumn } from '../../../@types/octree/OctreeColumn';
import type { OctreeIndexHeader } from '../../../@types/octree/OctreeIndexHeader';
import type { OctreeNodeTable } from '../../../@types/octree/OctreeNodeTable';
import type { StatId } from '../../../@types/octree/StatId';
import type { GalaxyOctreeObjectAtBase } from '../@types/GalaxyOctreeObjectAtBase';
import type { GalaxyOctreePayload } from '../@types/GalaxyOctreePayload';
import type { OctreeGalaxyRecordSourceDeps } from '../@types/OctreeGalaxyRecordSourceDeps';
import type { PgcShard } from '../@types/PgcShard';
import {
  POSITION_MATCH_MAX_ARCSEC,
  POSITION_MATCH_MAX_DIST_DELTA_MPC,
} from '../../../data/galaxyCatalog/positionMatchTolerance';
import {
  FLAG_DIAMETER_FALLBACK,
  FLAG_ORIENTATION_FALLBACK,
} from '../../../data/octree/galaxyRecordFlags';
import { OCTREE_FAMILIES } from '../../../data/octree/octreeFamilies';
import { NO_CHUNK_REF, OCTANTS } from '../../../data/octree/octreeFormat';
import { galaxyColumnBlockOfOctreeObject } from '../../../utils/galaxy/galaxyColumnBlockOfOctreeObject';
import { nearestRowByDirection } from '../../../utils/galaxy/nearestRowByDirection';
import { angularSepSqArcsec } from '../../../utils/math/angularSepSqArcsec';
import { cartesianToRaDec } from '../../../utils/math/cartesianToRaDec';
import { lowerBound } from '../../../utils/math/lowerBound';
import { raDecDistToCartesian } from '../../../utils/math/raDecDistToCartesian';
import { lowerBoundNodeRow } from '../../../utils/octree/lowerBoundNodeRow';
import { octreeIndex } from '../../../utils/octree/octreeIndex';
import { createChunkPairCache } from './createChunkPairCache';
import { fetchPgcShard } from './fetchPgcShard';

const PGC_ID = /^pgc-(\d+)$/;
const ARCSEC_RAD = Math.PI / (180 * 3600);

export function octreeGalaxyRecordSource(
  entry: Pick<GalaxyCatalogRegistryEntry, 'code' | 'binBaseName'>,
  { octree, header, info }: GalaxyOctreePayload,
  deps: OctreeGalaxyRecordSourceDeps,
): GalaxyRecordSource {
  const source = entry.code;
  const name = entry.binBaseName;
  const stat = (id: StatId): number => {
    const v = header.stats[id];
    if (v === undefined) throw new Error(`galaxy octree index lacks the ${id} stat`);
    return v;
  };
  const key = <K extends 'chunkDirectory' | 'namedPgcs' | 'pgcShards'>(k: K) => {
    const v = header[k];
    if (v === undefined) throw new Error(`galaxy octree index lacks ${k}`);
    return v as NonNullable<OctreeIndexHeader[K]>;
  };
  const magOffset = stat('magOffset');
  const directory = key('chunkDirectory');
  const refById = new Map(directory.map((ref) => [ref.id, ref]));
  const namedPgcs = key('namedPgcs');
  const shardFirstPgcs = key('pgcShards');
  const pairOf = createChunkPairCache(name, octree, deps.residency.chunk, deps.fetchBytes);
  const shards = new Map<number, Promise<PgcShard | null>>();
  const blocks = new WeakMap<OctreeNodeTable, GalaxyColumnBlock>();
  const indexObject: GalaxyOctreeObject = { nodes: octree.nodes, records: octree.records };

  function blockOf(object: GalaxyOctreeObject): GalaxyColumnBlock {
    let block = blocks.get(object.nodes);
    if (block === undefined) {
      block = galaxyColumnBlockOfOctreeObject(object, octree, magOffset);
      blocks.set(object.nodes, block);
    }
    return block;
  }

  function rowOf(
    object: GalaxyOctreeObject,
    infoColumns: ReadonlyMap<ColumnId, OctreeColumn>,
    local: number,
    ordinal: number,
  ): GalaxyRow | null {
    const { positions, diameterKpc, axisRatio, positionAngleDeg } = blockOf(object);
    if (Number.isNaN(positions[3 * local])) return null;
    const band = (id: ColumnId) =>
      (infoColumns.get(id) as Float32Array | undefined)?.[local] ?? NaN;
    const flags = Math.round(object.records.flags[local]!);
    return {
      type: 'galaxyCatalog',
      source,
      index: ordinal,
      objId: (infoColumns.get('objId') as BigUint64Array)[local]!.toString(),
      x: positions[3 * local]!,
      y: positions[3 * local + 1]!,
      z: positions[3 * local + 2]!,
      redshift: band('specZ'),
      magU: band('magU'),
      magG: band('magG'),
      magR: band('magR'),
      magI: band('magI'),
      magZ: band('magZ'),
      diameterKpc: diameterKpc[local]!,
      axisRatio: axisRatio[local]!,
      positionAngleDeg: positionAngleDeg[local]!,
      orientationIsFallback: (flags & FLAG_ORIENTATION_FALLBACK) !== 0,
      diameterIsFallback: (flags & FLAG_DIAMETER_FALLBACK) !== 0,
      // GLADE's parser writes 0 for both; the info objects do not carry them.
      classByte: 0,
      parentSurveyByte: 0,
    };
  }

  function chunkOfOrdinal(ordinal: number): OctreeChunkRef | null {
    const ref =
      directory[lowerBound(directory.length, (i) => directory[i]!.recordBase <= ordinal) - 1];
    return ref !== undefined && ordinal < ref.recordBase + ref.records ? ref : null;
  }

  function pgcOf(id: string): number | null {
    const m = PGC_ID.exec(id);
    const pgc = m === null ? 0 : Number(m[1]);
    // objId 0 is "no pgc" in the bake, never an id.
    return pgc > 0 && Number.isSafeInteger(pgc) ? pgc : null;
  }

  function shard(k: number): Promise<PgcShard | null> {
    let loading = shards.get(k);
    if (loading === undefined) {
      loading = fetchPgcShard(name, k, deps.fetchBytes).then((s) => {
        if (s === null) shards.delete(k);
        return s;
      });
      shards.set(k, loading);
    }
    return loading;
  }

  /**
   * Down from the index root through every cell the box `p ± r` meets, into each chunk root's
   * chunk (a chunk can have several roots and its ref names only the first, so a cell's child
   * is looked up by key in the chunk); the objects passed hold every record inside the box.
   */
  async function objectsNear(p: Vec3, r: number): Promise<GalaxyOctreeObjectAtBase[]> {
    const { unitMpc } = OCTREE_FAMILIES[octree.family];
    const passed: GalaxyOctreeObjectAtBase[] = [{ object: indexObject, base: 0 }];
    const stack = [{ object: indexObject, row: indexObject.nodes.count - 1 }];
    while (stack.length > 0) {
      const { object, row } = stack.pop()!;
      const { boxOrigin, boxEdge, childIndex } = octreeIndex(object.nodes, octree.grid);
      const half = boxEdge[row]! / 2;
      let met = 0;
      for (let octant = 0; octant < OCTANTS; octant++) {
        let meets = true;
        for (let a = 0; a < 3; a++) {
          const lo = boxOrigin[row * 3 + a]! + ((octant >> a) & 1) * half;
          meets &&= (p[a]! + r) / unitMpc >= lo && (p[a]! - r) / unitMpc <= lo + half;
        }
        if (meets) met |= 1 << octant;
      }
      const chunkId = object.nodes.chunkRef[row]!;
      if (chunkId === NO_CHUNK_REF) {
        for (let octant = 0; octant < OCTANTS; octant++) {
          const child = childIndex[row * OCTANTS + octant]!;
          if ((met >> octant) & 1 && child >= 0) stack.push({ object, row: child });
        }
        continue;
      }
      const ref = refById.get(chunkId);
      const pair = met === 0 || ref === undefined ? null : await pairOf(ref);
      if (ref === undefined || pair === null) continue;
      const { nodes } = pair.chunk;
      if (!passed.some((e) => e.object === pair.chunk)) {
        passed.push({ object: pair.chunk, base: ref.recordBase });
      }
      for (let octant = 0; octant < OCTANTS; octant++) {
        if (((met >> octant) & 1) === 0) continue;
        const level = object.nodes.level[row]! - 1;
        const morton = object.nodes.morton[row]! * OCTANTS + octant;
        const child = lowerBoundNodeRow(nodes, level, morton);
        if (child < nodes.count && nodes.level[child] === level && nodes.morton[child] === morton) {
          stack.push({ object: pair.chunk, row: child });
        }
      }
    }
    return passed;
  }

  async function nearestInTolerance(
    raDeg: number,
    decDeg: number,
    distMpc: number,
  ): Promise<number | null> {
    const cosDec = Math.cos((decDeg * Math.PI) / 180);
    // The match tolerance as a box half-edge: the distance band, plus the 30″ arc at that distance.
    const r = POSITION_MATCH_MAX_DIST_DELTA_MPC + distMpc * POSITION_MATCH_MAX_ARCSEC * ARCSEC_RAD;
    let best: number | null = null;
    let bestSqArcsec = Infinity;
    for (const { object, base } of await objectsNear(
      raDecDistToCartesian(raDeg, decDeg, distMpc),
      r,
    )) {
      const { positions, count } = blockOf(object);
      const i = nearestRowByDirection(positions, count, raDeg, decDeg, distMpc);
      if (i < 0) continue;
      const [ra, dec] = cartesianToRaDec(
        positions[3 * i]!,
        positions[3 * i + 1]!,
        positions[3 * i + 2]!,
      );
      const sqArcsec = angularSepSqArcsec(ra, dec, raDeg, decDeg, cosDec);
      if (sqArcsec < bestSqArcsec) {
        bestSqArcsec = sqArcsec;
        best = base + i;
      }
    }
    return best;
  }

  return {
    source,
    recordCount: octree.recordCount,
    stats: {
      medianAbsMag: stat('medianAbsMag'),
      magOffset,
      provenance: {
        total: octree.recordCount,
        estimated: { orientation: stat('orientationEstimated'), size: stat('diameterEstimated') },
      },
    },
    ordinalOfPick: (pickIndex) => deps.renderer.recordOrdinal(source, pickIndex),
    pickOfOrdinal: (ordinal) => deps.renderer.poolRecordIndex(source, ordinal),
    forEachResidentBlock(visit) {
      visit(blockOf(indexObject), 0);
      // A chunk is resident only under a resident parent, so the walk stops at the first gap.
      const walk = (refs: readonly OctreeChunkRef[]): void => {
        for (const ref of refs) {
          const chunk = deps.residency.chunk(ref.id);
          if (chunk === null) continue;
          visit(blockOf(chunk), ref.recordBase);
          walk(chunk.chunks);
        }
      };
      walk(octree.chunks);
    },
    hasDurableId(id) {
      const pgc = pgcOf(id);
      if (pgc === null) return false;
      const i = lowerBound(namedPgcs.length, (j) => namedPgcs[j]! < pgc);
      return namedPgcs[i] === pgc;
    },
    loadRow(ordinal) {
      if (!Number.isInteger(ordinal) || ordinal < 0) return null;
      if (ordinal < octree.records.count) return rowOf(indexObject, info, ordinal, ordinal);
      const ref = chunkOfOrdinal(ordinal);
      if (ref === null) return null;
      return pairOf(ref).then(
        (pair) => pair && rowOf(pair.chunk, pair.info, ordinal - ref.recordBase, ordinal),
      );
    },
    resolveDurableId(id) {
      const pgc = pgcOf(id);
      if (pgc === null) return null;
      const k = lowerBound(shardFirstPgcs.length, (i) => shardFirstPgcs[i]! <= pgc) - 1;
      if (k < 0) return null;
      const want = BigInt(pgc);
      return shard(k).then((s) => {
        if (s === null) return null;
        const i = lowerBound(s.objId.length, (j) => s.objId[j]! < want);
        return s.objId[i] === want ? s.ordinal[i]! : null;
      });
    },
    resolvePosition: (raDeg, decDeg, distMpc) =>
      distMpc === null ? null : nearestInTolerance(raDeg, decDeg, distMpc),
  };
}
