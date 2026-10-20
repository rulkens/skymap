import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import { decodeOctreeChunk } from '../../../src/data/octree/decodeOctreeChunk';
import { decodeOctreeIndex } from '../../../src/data/octree/decodeOctreeIndex';
import { decodeOctreeInfo } from '../../../src/data/octree/decodeOctreeInfo';
import {
  octreeChunkFileName,
  octreeChunkInfoFileName,
} from '../../../src/data/octree/octreeFormat';
import { countEstimatedProvenance } from '../../../src/utils/countEstimatedProvenance';
import { galaxyMagOffset } from '../../../src/utils/galaxy/galaxyMagOffset';
import { galaxyMedianAbsMag } from '../../../src/utils/galaxy/galaxyMedianAbsMag';
import { mulberry32 } from '../../../src/utils/random/mulberry32';
import { buildGladeOctree } from '../../../tools/catalog/buildGladeOctree';

const forced = vi.hoisted(() => ({ weights: null as Float32Array | null }));
vi.mock('../../../tools/catalog/bias/bakeBiasWeights', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../tools/catalog/bias/bakeBiasWeights')>();
  return {
    bakeBiasWeights: (...args: Parameters<typeof actual.bakeBiasWeights>) =>
      forced.weights ?? actual.bakeBiasWeights(...args),
  };
});

const PGC_BASE = 1_000_000;

/** A synthetic GLADE: pgc = PGC_BASE + row except every 10th row, which has none. */
function makeCloud(n: number): GalaxyCatalog {
  const rand = mulberry32(7);
  const f = (fill: (i: number) => number) => Float32Array.from({ length: n }, (_, i) => fill(i));
  return {
    count: n,
    objIDs: BigUint64Array.from({ length: n }, (_, i) =>
      i % 10 === 0 ? 0n : BigInt(PGC_BASE + i),
    ),
    positions: f(() => (rand() - 0.5) * 800),
    magU: f(() => 16 + rand()),
    magG: f(() => 14 + rand() * 5),
    magR: f(() => 14 + rand() * 5),
    magI: f(() => 14 + rand() * 5),
    magZ: f(() => 14 + rand() * 5),
    axisRatio: f(() => 0.2 + rand() * 0.8),
    positionAngleDeg: f(() => rand() * 360 - 90),
    diameterKpc: f(() => 5 + rand() * 40),
    classByte: new Uint8Array(n),
    parentSurveyByte: new Uint8Array(n),
    spectroscopicZ: f(() => rand() * 0.1),
    orientationIsFallback: Uint8Array.from({ length: n }, (_, i) => (i % 4 === 0 ? 1 : 0)),
    diameterIsFallback: Uint8Array.from({ length: n }, (_, i) => (i % 6 === 0 ? 1 : 0)),
    angularWeight: new Uint8Array(n),
    log10StellarMass: f(() => 8 + rand() * 3),
  } as GalaxyCatalog;
}

const read = (path: string): ArrayBuffer => {
  const b = fs.readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('buildGladeOctree', () => {
  const dirs: string[] = [];
  const bake = (cloud: GalaxyCatalog, aliasPgcs: readonly number[] = []) => {
    const outDir = fs.mkdtempSync(join(tmpdir(), 'glade-octree-'));
    dirs.push(outDir);
    const header = buildGladeOctree(cloud, { outDir, biasWeight: 'angular', aliasPgcs });
    return { header, dir: join(outDir, 'galaxy-octree/v1') };
  };
  afterEach(() => {
    forced.weights = null;
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('a synthetic GLADE bake round-trips: every input pgc resolves through its shard to an ordinal whose info objId is that pgc', () => {
    const N = 5_000;
    const { header, dir } = bake(makeCloud(N));
    const index = decodeOctreeIndex(read(join(dir, 'glade.bin'))).header;
    const directory = index.chunkDirectory!;
    const shards = index.pgcShards!;
    const shardCache = new Map<number, ReadonlyMap<string, ArrayLike<unknown>>>();
    const shardOf = (k: number) => {
      if (!shardCache.has(k))
        shardCache.set(
          k,
          decodeOctreeInfo(read(join(dir, `glade.pgc-${k}.bin`)), ['objId', 'ordinal']).columns,
        );
      return shardCache.get(k)!;
    };
    const indexInfo = decodeOctreeInfo(read(join(dir, 'glade.info.bin')), ['objId']).columns;
    expect(header.records + directory.reduce((s, c) => s + c.records, 0)).toBeGreaterThanOrEqual(N);
    expect(index.chunkDirectory).toBeDefined();

    let checked = 0;
    for (let i = 0; i < N; i++) {
      if (i % 10 === 0) continue;
      const pgc = PGC_BASE + i;
      let k = shards.length - 1;
      while (shards[k]! > pgc) k--;
      const cols = shardOf(k);
      const row = (cols.get('objId')! as BigUint64Array).indexOf(BigInt(pgc));
      const ordinal = (cols.get('ordinal') as Float32Array)[row]!;
      let objId: bigint;
      const owner = directory.filter((c) => c.recordBase <= ordinal).at(-1);
      if (ordinal < index.records || !owner) {
        objId = (indexInfo.get('objId') as BigUint64Array)[ordinal]!;
      } else {
        const info = decodeOctreeInfo(read(join(dir, 'glade', octreeChunkInfoFileName(owner))), [
          'objId',
        ]);
        objId = (info.columns.get('objId') as BigUint64Array)[ordinal - owner.recordBase]!;
      }
      expect(objId).toBe(BigInt(pgc));
      checked++;
    }
    expect(checked).toBe(N - N / 10);
  });

  it('records without a pgc are absent from the shards and from namedPgcs', () => {
    const { header, dir } = bake(makeCloud(500), [PGC_BASE + 1, PGC_BASE + 10, 42]);
    // Row 10 has no pgc; 42 is not a GLADE pgc.
    expect(header.namedPgcs).toEqual([PGC_BASE + 1]);
    let total = 0;
    header.pgcShards!.forEach((_, k) => {
      const ids = decodeOctreeInfo(read(join(dir, `glade.pgc-${k}.bin`)), ['objId']).columns.get(
        'objId',
      ) as BigUint64Array;
      expect(ids.includes(0n)).toBe(false);
      total += ids.length;
    });
    expect(total).toBe(450);
  });

  it('header stats equal the flat helpers over the same records', () => {
    const cloud = makeCloud(800);
    const { header } = bake(cloud);
    const estimated = countEstimatedProvenance(cloud).estimated;
    expect(header.stats).toMatchObject({
      recordCount: 800,
      medianAbsMag: galaxyMedianAbsMag(cloud),
      magOffset: galaxyMagOffset(cloud),
      orientationEstimated: estimated.orientation,
      diameterEstimated: estimated.size,
    });
  });

  it("w = 0 and w = 0.05 bake to angularWeight code 1, the codec's floor", () => {
    const N = 200;
    const cloud = makeCloud(N);
    forced.weights = Float32Array.from({ length: N }, (_, i) => (i === 1 ? 0 : i === 2 ? 0.05 : 1));
    const { dir } = bake(cloud);
    const index = decodeOctreeIndex(read(join(dir, 'glade.bin')));
    const shard = decodeOctreeInfo(read(join(dir, 'glade.pgc-0.bin')), [
      'objId',
      'ordinal',
    ]).columns;
    const ids = shard.get('objId') as BigUint64Array;
    const ordinals = shard.get('ordinal') as Float32Array;
    const weight = (row: number) => {
      const ordinal = ordinals[ids.indexOf(BigInt(PGC_BASE + row))]!;
      if (ordinal < index.header.records)
        return (index.columns.get('angularWeight') as Float32Array)[ordinal]!;
      const owner = index.header.chunkDirectory!.filter((c) => c.recordBase <= ordinal).at(-1)!;
      const chunk = decodeOctreeChunk(
        read(join(dir, 'glade', octreeChunkFileName(owner))),
        index.header,
      );
      return (chunk.columns.get('angularWeight') as Float32Array)[ordinal - owner.recordBase]!;
    };
    // Code 1 dequantises to log10 0.1 = -1; w = 1 is code 128, log10 1 = 0.
    expect(weight(1)).toBeCloseTo(-1, 5);
    expect(weight(2)).toBeCloseTo(-1, 5);
    expect(weight(3)).toBeCloseTo(0, 2);
  });
});
