/**
 * The pgc shards: every record with a pgc as `(objId, ordinal)`, sorted by pgc and cut into
 * fixed-size SKOF objects, so a pgc finds its ordinal with one shard fetch. The ordinal is the
 * record's catalog-global pool ordinal (`recordBase + i`), which the stratify permutation owns.
 */
import type { ColumnId } from '../../src/@types/octree/ColumnId';
import type { OctreeRawColumn } from '../@types/octree/OctreeRawColumn';
import type { OctreeObjects } from '../@types/octree/OctreeObjects';
import { PGC_SHARD_SCHEMA } from '../../src/data/octree/galaxyOctreeFamily';
import { encodeOctreeObject } from '../octree/encodeOctreeObject';
import { NO_SOURCE_ROW } from '../octree/noSourceRow';

export const PGC_SHARD_RECORDS = 65_536;

export function buildGladeShards(
  objects: OctreeObjects,
  objIds: BigUint64Array,
): { readonly shards: readonly Uint8Array[]; readonly firstPgcs: readonly number[] } {
  const ids: bigint[] = [];
  const ordinals: number[] = [];
  const collect = (base: number, sourceRows: Uint32Array) => {
    sourceRows.forEach((row, i) => {
      if (row === NO_SOURCE_ROW || objIds[row] === 0n) return;
      ids.push(objIds[row]!);
      ordinals.push(base + i);
    });
  };
  collect(0, objects.index.sourceRows);
  for (const c of objects.chunks) collect(c.recordBase, c.sourceRows);

  const order = Uint32Array.from(ids, (_, i) => i).sort((a, b) =>
    ids[a]! < ids[b]! ? -1 : ids[a]! > ids[b]! ? 1 : ordinals[a]! - ordinals[b]!,
  );
  const shards: Uint8Array[] = [];
  const firstPgcs: number[] = [];
  for (let start = 0; start < order.length; start += PGC_SHARD_RECORDS) {
    const rows = order.subarray(start, start + PGC_SHARD_RECORDS);
    firstPgcs.push(Number(ids[rows[0]!]!));
    shards.push(
      encodeOctreeObject(
        { kind: 'info', records: rows.length, columns: PGC_SHARD_SCHEMA },
        null,
        PGC_SHARD_SCHEMA,
        new Map<ColumnId, OctreeRawColumn>([
          ['objId', BigUint64Array.from(Array.from(rows, (r) => ids[r]!))],
          ['ordinal', Uint32Array.from(rows, (r) => ordinals[r]!)],
        ]),
      ),
    );
  }
  return { shards, firstPgcs };
}
