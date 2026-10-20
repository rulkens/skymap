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
import type { OctreeNodeTable } from '../../../@types/octree/OctreeNodeTable';
import type { StatId } from '../../../@types/octree/StatId';
import type { GalaxyOctreePayload } from '../@types/GalaxyOctreePayload';
import type { OctreeGalaxyRecordSourceDeps } from '../@types/OctreeGalaxyRecordSourceDeps';
import type { PgcShard } from '../@types/PgcShard';
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

const FLAG_ORIENTATION_FALLBACK = 1;
const FLAG_DIAMETER_FALLBACK = 2;
const PGC_ID = /^pgc-(\d+)$/;

export function octreeGalaxyRecordSource(
  entry: GalaxyCatalogRegistryEntry,
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
  const magOffset = stat('magOffset');
  const directory = header.chunkDirectory ?? [];
  const refById = new Map(directory.map((ref) => [ref.id, ref]));
  const namedPgcs = header.namedPgcs ?? [];
  const shardFirstPgcs = header.pgcShards ?? [];
  const pairs = createChunkPairCache(name, octree, deps.fetchBytes);
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
   * Down from the index root toward `p`'s cell, through each chunk root's chunk (a chunk
   * can have several roots and its ref names only the first, so the cell's child is looked
   * up by key in the chunk); the objects passed hold every record whose cell contains `p`.
   */
  async function objectsAbove(p: Vec3): Promise<{ object: GalaxyOctreeObject; base: number }[]> {
    const { unitMpc } = OCTREE_FAMILIES[octree.family];
    const passed = [{ object: indexObject, base: 0 }];
    let object = indexObject;
    let row = object.nodes.count - 1;
    while (row >= 0) {
      const { boxOrigin, boxEdge, childIndex } = octreeIndex(object.nodes, octree.grid);
      const half = boxEdge[row]! / 2;
      let octant = 0;
      for (let a = 0; a < 3; a++) {
        if (p[a]! / unitMpc >= boxOrigin[row * 3 + a]! + half) octant |= 1 << a;
      }
      const chunkId = object.nodes.chunkRef[row]!;
      if (chunkId === NO_CHUNK_REF) {
        row = childIndex[row * OCTANTS + octant]!;
        continue;
      }
      const ref = refById.get(chunkId);
      const pair = ref === undefined ? null : await pairs.get(ref);
      if (ref === undefined || pair === null) break;
      const level = object.nodes.level[row]! - 1;
      const morton = object.nodes.morton[row]! * OCTANTS + octant;
      object = pair.chunk;
      passed.push({ object, base: ref.recordBase });
      const child = lowerBoundNodeRow(object.nodes, level, morton);
      const found =
        child < object.nodes.count &&
        object.nodes.level[child] === level &&
        object.nodes.morton[child] === morton;
      row = found ? child : -1;
    }
    return passed;
  }

  async function nearestOnPath(
    raDeg: number,
    decDeg: number,
    distMpc: number,
  ): Promise<number | null> {
    const cosDec = Math.cos((decDeg * Math.PI) / 180);
    let best: number | null = null;
    let bestSqArcsec = Infinity;
    for (const { object, base } of await objectsAbove(
      raDecDistToCartesian(raDeg, decDeg, distMpc),
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
      return pairs
        .get(ref)
        .then((pair) => pair && rowOf(pair.chunk, pair.info, ordinal - ref.recordBase, ordinal));
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
      distMpc === null ? null : nearestOnPath(raDeg, decDeg, distMpc),
  };
}
