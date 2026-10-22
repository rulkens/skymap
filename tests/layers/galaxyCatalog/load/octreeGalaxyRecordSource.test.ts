/**
 * The octree record source over a real synthetic GLADE bake on disk (`buildGladeOctree`),
 * its fetches served from that directory: blobs answer no row and count as no member, a pgc
 * resolves through its shard to a chunk record, a position descends to its record, and a
 * released source's late row is never served through the bridge.
 */
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyColumns } from '../../../../src/@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyRecordSource } from '../../../../src/@types/data/galaxyCatalog/GalaxyRecordSource';
import type { GalaxyRow } from '../../../../src/@types/engine/GalaxyRow';
import type { OctreeChunk } from '../../../../src/@types/octree/OctreeChunk';
import type { GalaxyOctreePayload } from '../../../../src/layers/galaxyCatalog/@types/GalaxyOctreePayload';
import { decodeOctreeChunk } from '../../../../src/data/octree/decodeOctreeChunk';
import { decodeOctreeIndex } from '../../../../src/data/octree/decodeOctreeIndex';
import { decodeOctreeInfo } from '../../../../src/data/octree/decodeOctreeInfo';
import { GALAXY_INFO_REQUIRED_COLUMNS } from '../../../../src/data/octree/galaxyOctreeFamily';
import { Source, SOURCE_REGISTRY } from '../../../../src/data/sources';
import { flatGalaxyRecordSource } from '../../../../src/layers/galaxyCatalog/load/flatGalaxyRecordSource';
import { octreeGalaxyRecordSource } from '../../../../src/layers/galaxyCatalog/load/octreeGalaxyRecordSource';
import { galaxyRecordBridge } from '../../../../src/layers/galaxyCatalog/present/galaxyRecordBridge';
import { structureMembership } from '../../../../src/layers/galaxyCatalog/present/structureMembership';
import { galaxyColumnsOf } from '../../../../src/utils/galaxy/galaxyColumnsOf';
import { cartesianToRaDec } from '../../../../src/utils/math/cartesianToRaDec';
import { octreeChunkInfoPath } from '../../../../src/utils/octree/octreeChunkInfoPath';
import { octreeChunkPath } from '../../../../src/utils/octree/octreeChunkPath';
import { octreeFromIndex } from '../../../../src/utils/octree/octreeFromIndex';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';
import { buildGladeOctree } from '../../../../tools/catalog/buildGladeOctree';

const N = 3_000;
const PGC_BASE = 1_000_000;
const NAMED_ROW = 7;
const ENTRY = SOURCE_REGISTRY[Source.Glade];

/** pgc = PGC_BASE + row, except every 10th row, which has none (objId 0); a cube `spreadMpc` wide. */
function makeCloud(spreadMpc = 800): GalaxyCatalog {
  const rand = mulberry32(11);
  const f = (fill: () => number) => Float32Array.from({ length: N }, fill);
  return {
    count: N,
    objIDs: BigUint64Array.from({ length: N }, (_, i) =>
      i % 10 === 0 ? 0n : BigInt(PGC_BASE + i),
    ),
    // Off the origin, so a dense cube still has well-defined directions.
    positions: Float32Array.from(
      { length: 3 * N },
      (_, i) => (i % 3 === 0 ? spreadMpc : 0) + (rand() - 0.5) * spreadMpc,
    ),
    magU: f(() => 16 + rand()),
    magG: f(() => 14 + rand() * 5),
    magR: f(() => 14 + rand() * 5),
    magI: f(() => 14 + rand() * 5),
    magZ: f(() => 14 + rand() * 5),
    axisRatio: f(() => 0.2 + rand() * 0.8),
    positionAngleDeg: f(() => rand() * 180),
    diameterKpc: f(() => 5 + rand() * 40),
    classByte: new Uint8Array(N),
    parentSurveyByte: new Uint8Array(N),
    spectroscopicZ: f(() => rand() * 0.1),
    orientationIsFallback: new Uint8Array(N),
    diameterIsFallback: new Uint8Array(N),
    angularWeight: new Uint8Array(N),
    log10StellarMass: f(() => 8 + rand() * 3),
  } as GalaxyCatalog;
}

let outDir: string;
let cloud: GalaxyCatalog;
let payload: GalaxyOctreePayload;

/** A logical data path's bytes from a bake, null when the bake has no such file. */
const fetchFrom =
  (dir: () => string) =>
  async (path: string): Promise<ArrayBuffer | null> => {
    const file = join(dir(), path);
    if (!fs.existsSync(file)) return null;
    const b = fs.readFileSync(file);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
const fetchBytes = fetchFrom(() => outDir);

/** A bake's index payload, as `galaxyOctreeFetcher` decodes it. */
async function payloadOf(fetch: typeof fetchBytes): Promise<GalaxyOctreePayload> {
  const index = decodeOctreeIndex((await fetch('galaxy-octree/v1/glade.bin'))!);
  return {
    octree: octreeFromIndex(index, galaxyColumnsOf),
    header: index.header,
    info: decodeOctreeInfo(
      (await fetch('galaxy-octree/v1/glade.info.bin'))!,
      GALAXY_INFO_REQUIRED_COLUMNS,
    ).columns,
  };
}

/** The source with these chunk ids resident (decoded from disk, as the stream would). */
async function sourceWith(
  resident: readonly number[] = [],
  fetch: typeof fetchBytes = fetchBytes,
): Promise<GalaxyRecordSource> {
  const chunks = new Map<number, OctreeChunk<GalaxyColumns>>();
  for (const id of resident) {
    const ref = payload.header.chunkDirectory!.find((r) => r.id === id)!;
    const obj = decodeOctreeChunk(
      (await fetchBytes(octreeChunkPath('galaxy', ENTRY.binBaseName, ref)))!,
      payload.header,
    );
    chunks.set(id, {
      ref,
      parent: null,
      nodes: obj.nodes,
      records: galaxyColumnsOf(obj.columns, obj.header.records),
      chunks: obj.header.chunks,
    });
  }
  return octreeGalaxyRecordSource(ENTRY, payload, {
    renderer: { recordOrdinal: (_s, n) => n, poolRecordIndex: (_s, n) => n },
    residency: { chunk: (id) => chunks.get(id) ?? null },
    fetchBytes: fetch,
  });
}

/** A record's pgc and ordinal through the shard, where the ordinal lies in a chunk. */
async function chunkRecord(): Promise<{ pgc: number; ordinal: number }> {
  const shard = decodeOctreeInfo((await fetchBytes('galaxy-octree/v1/glade.pgc-0.bin'))!, [
    'objId',
    'ordinal',
  ]).columns;
  const ordinals = shard.get('ordinal') as Float64Array;
  const i = ordinals.findIndex((o) => o >= payload.octree.records.count);
  return { pgc: Number((shard.get('objId') as BigUint64Array)[i]!), ordinal: ordinals[i]! };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(async () => {
  outDir = fs.mkdtempSync(join(tmpdir(), 'octree-record-source-'));
  cloud = makeCloud();
  buildGladeOctree(cloud, { outDir, biasWeight: 'none', aliasPgcs: [PGC_BASE + NAMED_ROW] });
  payload = await payloadOf(fetchBytes);
});

afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }));

describe('octreeGalaxyRecordSource', () => {
  it('a blob ordinal loads no row and never counts as a structure member', async () => {
    const ref = payload.header.chunkDirectory![0]!;
    const source = await sourceWith([ref.id]);
    const blobsOf = (nodes: OctreeChunk<GalaxyColumns>['nodes'], base: number) =>
      Array.from({ length: nodes.count }, (_, row) => row)
        .filter((row) => nodes.childMask[row] !== 0)
        .map((row) => base + nodes.firstRecord[row]! + nodes.ownCount[row]!);
    const indexBlobs = blobsOf(payload.octree.nodes, 0);
    expect(indexBlobs.length).toBeGreaterThan(0);
    for (const ordinal of indexBlobs) expect(source.loadRow(ordinal)).toBeNull();

    const chunkNodes = decodeOctreeChunk(
      (await fetchBytes(octreeChunkPath('galaxy', 'glade', ref)))!,
      payload.header,
    ).nodes;
    const chunkBlob = blobsOf(chunkNodes, ref.recordBase)[0]!;
    expect(await source.loadRow(chunkBlob)).toBeNull();

    // Every resident record lies inside this radius: the members are exactly the real ones.
    const real = [payload.octree.nodes, chunkNodes].reduce(
      (sum, nodes) => sum + nodes.ownCount.reduce((s, n) => s + n, 0),
      0,
    );
    expect(structureMembership([source], [0, 0, 0], 1e5).count).toBe(real);
  });

  it('pgc of a non-resident chunk resolves through its shard, and loadRow settles to that galaxy', async () => {
    const source = await sourceWith();
    const { pgc, ordinal } = await chunkRecord();

    const resolving = source.resolveDurableId(`pgc-${pgc}`);
    expect(resolving).toBeInstanceOf(Promise);
    expect(await resolving).toBe(ordinal);
    const row = (await source.loadRow(ordinal)) as GalaxyRow;
    expect(row.objId).toBe(String(pgc));
    const inputRow = pgc - PGC_BASE;
    expect(row.redshift).toBeCloseTo(cloud.spectroscopicZ[inputRow]!, 6);
    for (let a = 0; a < 3; a++) {
      expect(Math.abs([row.x, row.y, row.z][a]! - cloud.positions[3 * inputRow + a]!)).toBeLessThan(
        0.05,
      );
    }
    expect(await source.resolveDurableId(`pgc-${PGC_BASE + 10}`)).toBeNull();
  });

  it('a pending loadRow from a released octree source is not served after the flat source replaces it', async () => {
    const records = new Map<GalaxyCatalogSourceType, GalaxyRecordSource>([
      [Source.Glade, await sourceWith()],
    ]);
    const bridge = galaxyRecordBridge(records);
    const settled = vi.fn();
    bridge.onSettle(settled);
    const ordinal = payload.octree.records.count + 5;
    expect(bridge.row(Source.Glade, ordinal)).toBeNull();

    const flat = flatGalaxyRecordSource(ENTRY, cloud, () => []);
    records.set(Source.Glade, flat);
    for (let i = 0; i < 5; i++) await flush();

    expect(settled).not.toHaveBeenCalled();
    expect(bridge.row(Source.Glade, ordinal)).toEqual(flat.loadRow(ordinal));
  });

  it('a chunk pair whose decode throws leaves the cache, so the next row ask fetches again', async () => {
    const ordinal = payload.octree.records.count + 5;
    let corrupt = true;
    const source = await sourceWith([], async (path) => {
      if (corrupt && path.includes('.info.') && !path.endsWith('glade.info.bin')) {
        corrupt = false;
        return new ArrayBuffer(16);
      }
      return fetchBytes(path);
    });
    await expect(source.loadRow(ordinal)).rejects.toThrow();
    expect(await source.loadRow(ordinal)).not.toBeNull();
  });

  it("a resident chunk's row fetches only its info object", async () => {
    const ref = payload.header.chunkDirectory![0]!;
    const fetched: string[] = [];
    const source = await sourceWith([ref.id], (path) => {
      fetched.push(path);
      return fetchBytes(path);
    });
    fetched.length = 0;
    expect(await source.loadRow(ref.recordBase)).not.toBeNull();
    expect(fetched).toEqual([octreeChunkInfoPath('galaxy', ENTRY.binBaseName, ref)]);
  });

  it.each(['chunkDirectory', 'namedPgcs', 'pgcShards'] as const)(
    'an index without %s is refused',
    (key) => {
      const header = { ...payload.header, [key]: undefined };
      expect(() =>
        octreeGalaxyRecordSource(
          ENTRY,
          { ...payload, header },
          {
            renderer: { recordOrdinal: (_s, n) => n, poolRecordIndex: (_s, n) => n },
            residency: { chunk: () => null },
            fetchBytes,
          },
        ),
      ).toThrow(key);
    },
  );

  it('hasDurableId is false for objId 0 and for pgcs outside namedPgcs', async () => {
    const source = await sourceWith();
    expect(source.hasDurableId(`pgc-${PGC_BASE + NAMED_ROW}`)).toBe(true);
    expect(source.hasDurableId('pgc-0')).toBe(false);
    expect(source.hasDurableId(`pgc-${PGC_BASE + NAMED_ROW + 1}`)).toBe(false);
    expect(source.hasDurableId(`sdss-${PGC_BASE + NAMED_ROW}`)).toBe(false);
  });

  it('resolvePosition with a distance finds the record; without one it answers null', async () => {
    const source = await sourceWith();
    const { ordinal } = await chunkRecord();
    const row = (await source.loadRow(ordinal)) as GalaxyRow;
    const [ra, dec] = cartesianToRaDec(row.x, row.y, row.z);

    expect(await source.resolvePosition(ra, dec, Math.hypot(row.x, row.y, row.z))).toBe(ordinal);
    expect(source.resolvePosition(ra, dec, null)).toBeNull();
  });

  it('resolvePosition finds a record from anywhere inside the match tolerance, across chunk faces', async () => {
    // Dense enough that records sit within the 0.05 Mpc distance tolerance of a chunk's face.
    const denseDir = fs.mkdtempSync(join(tmpdir(), 'octree-record-source-dense-'));
    try {
      buildGladeOctree(makeCloud(4), { outDir: denseDir, biasWeight: 'none', aliasPgcs: [] });
      const fetch = fetchFrom(() => denseDir);
      const dense = await payloadOf(fetch);
      const source = octreeGalaxyRecordSource(ENTRY, dense, {
        renderer: { recordOrdinal: (_s, n) => n, poolRecordIndex: (_s, n) => n },
        residency: { chunk: () => null },
        fetchBytes: fetch,
      });
      const misses: number[] = [];
      for (
        let ordinal = dense.octree.records.count;
        ordinal < dense.octree.recordCount;
        ordinal++
      ) {
        const row = (await source.loadRow(ordinal)) as GalaxyRow | null;
        if (row === null) continue;
        const [ra, dec] = cartesianToRaDec(row.x, row.y, row.z);
        const d = Math.hypot(row.x, row.y, row.z);
        for (const delta of [0.045, -0.045]) {
          if ((await source.resolvePosition(ra, dec, d + delta)) === null) misses.push(ordinal);
        }
      }
      expect(misses).toEqual([]);
    } finally {
      fs.rmSync(denseDir, { recursive: true, force: true });
    }
  });
});
