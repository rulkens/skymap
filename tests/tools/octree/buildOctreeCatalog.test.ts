import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { ColumnSchema } from '../../../src/@types/octree/ColumnSchema';
import type { OctreeChunkRef } from '../../../src/@types/octree/OctreeChunkRef';
import type { OctreeIndexHeader } from '../../../src/@types/octree/OctreeIndexHeader';
import type { OctreeCatalogMeta } from '../../../tools/@types/octree/OctreeCatalogMeta';
import type { OctreeInfoInput } from '../../../tools/@types/octree/OctreeInfoInput';
import type { OctreeObjects } from '../../../tools/@types/octree/OctreeObjects';
import { decodeOctreeChunk } from '../../../src/data/octree/decodeOctreeChunk';
import { decodeOctreeIndex } from '../../../src/data/octree/decodeOctreeIndex';
import { decodeOctreeInfo } from '../../../src/data/octree/decodeOctreeInfo';
import {
  octreeChunkFileName,
  octreeChunkInfoFileName,
} from '../../../src/data/octree/octreeFormat';
import { chunkOctree } from '../../../tools/octree/chunkOctree';
import { NO_SOURCE_ROW } from '../../../tools/octree/noSourceRow';
import { stratifyOctree } from '../../../tools/octree/stratifyOctree';
import { writeOctreeCatalog } from '../../../tools/octree/writeOctreeCatalog';
import { contentHash8 } from '../../../tools/utils/data/contentHash8';
import {
  makeOctreeBuildInput,
  randomOctreeRecords,
  TEST_STRATIFY,
} from '../../fixtures/makeOctreeBuildInput';
import { STAR_COLUMN_SCHEMA } from '../../../src/data/octree/starOctreeFamily';

const GRID = { bits: 6, origin: [0, 0, 0] as [number, number, number], cellEdge: 10 };
const CAPACITY = 300;
const NODE_CAPACITY = 40;
const N = 3000;

function meta(): OctreeCatalogMeta {
  return {
    family: 'star',
    grid: GRID,
    stratify: TEST_STRATIFY,
    schema: STAR_COLUMN_SCHEMA,
    stats: { starCount: N },
  };
}

/** A catalog whose chunks nest at least two deep (see the chunkOctree nesting test). */
function nestedObjects(seed: number): OctreeObjects {
  const input = makeOctreeBuildInput(randomOctreeRecords(N, seed, 640, [4, 14]), GRID);
  return chunkOctree(stratifyOctree(input), CAPACITY, NODE_CAPACITY);
}

const read = (path: string): ArrayBuffer => {
  const b = fs.readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('buildOctreeCatalog → writeOctreeCatalog', () => {
  const dirs: string[] = [];
  const tempDir = () => {
    const d = fs.mkdtempSync(join(tmpdir(), 'octree-'));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('round-trips the index and every chunk at every depth through the headers alone', () => {
    const objects = nestedObjects(3);
    const dir = tempDir();
    writeOctreeCatalog(objects, meta(), dir, 'stars');

    const index = decodeOctreeIndex(read(join(dir, 'stars.bin')));
    expect(index.header.chunkNodeCap).toBe(objects.index.chunkNodeCap);
    expect(index.header.stats).toEqual({ starCount: N, chunkCount: objects.chunks.length });

    // Walk the tree from the index: each header lists exactly its own chunks, by global id.
    let real = index.nodes.ownCount.reduce((a, b) => a + b, 0);
    const seen: number[] = [];
    const walk = (refs: readonly OctreeChunkRef[], parent: number | null) => {
      expect(refs.map((r) => r.id)).toEqual(
        objects.chunks.flatMap((c, id) => (c.parent === parent ? [id] : [])),
      );
      for (const ref of refs) {
        const object = objects.chunks[ref.id]!;
        expect([ref.roots, ref.recordBase]).toEqual([object.roots, object.recordBase]);
        const chunk = decodeOctreeChunk(
          read(join(dir, 'stars', octreeChunkFileName(ref))),
          index.header,
        );
        expect(chunk.header.nodes).toBe(ref.nodes);
        expect(Array.from(chunk.nodes.chunkRef)).toEqual(Array.from(object.nodes.chunkRef));
        real += chunk.nodes.ownCount.reduce((a, b) => a + b, 0);
        seen.push(ref.id);
        walk(chunk.header.chunks, ref.id);
      }
    };
    walk(index.header.chunks, null);
    expect(seen.sort((a, b) => a - b)).toEqual(objects.chunks.map((_, id) => id));
    expect(real).toBe(N);

    const written = objects.chunks[0]!.columns.get('offset')!;
    const ref = index.header.chunks[0]!;
    const decoded = decodeOctreeChunk(
      read(join(dir, 'stars', octreeChunkFileName(ref))),
      index.header,
    ).columns.get('offset') as Uint16Array;
    expect(decoded.length).toBe(written.length);
    written.forEach((f, i) =>
      expect(Math.abs(decoded[i]! / 65536 - f)).toBeLessThanOrEqual(1 / 65536),
    );
  });

  it('writes every chunk before the object that lists it, and the index last', () => {
    const objects = nestedObjects(9);
    const spy = vi.spyOn(fs, 'writeFileSync');
    const header: OctreeIndexHeader = writeOctreeCatalog(objects, meta(), tempDir(), 'stars');

    const paths = spy.mock.calls.map((call) => String(call[0]));
    expect(paths.length).toBe(objects.chunks.length + 1);
    expect(paths[paths.length - 1]).toMatch(/\/stars\.bin$/);
    const writtenAt = (ref: OctreeChunkRef) =>
      paths.findIndex((p) => p.endsWith(`/${octreeChunkFileName(ref)}`));
    const check = (refs: readonly OctreeChunkRef[], parentAt: number) => {
      for (const ref of refs) {
        const at = writtenAt(ref);
        expect(at).toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThan(parentAt);
        const path = paths[at]!;
        check(decodeOctreeChunk(read(path), header).header.chunks, at);
      }
    };
    check(header.chunks, paths.length - 1);
  });

  // Tasks 2 and 5 reshape the family code around this bake; no baked byte may move. The index
  // header names every chunk's content hash, so one digest pins every object.
  it('a seeded star bake keeps its pinned index digest', () => {
    const dir = tempDir();
    writeOctreeCatalog(nestedObjects(3), meta(), dir, 'stars');
    expect(contentHash8(fs.readFileSync(join(dir, 'stars.bin')))).toBe('2a8af3b2');
  });
});

const INFO_SCHEMA: readonly ColumnSchema[] = [
  { id: 'objId', store: 'u64', q0: 0, q1: 1 },
  { id: 'specZ', store: 'f32', q0: 0, q1: 1 },
  { id: 'logMass', store: 'u8', q0: 0, q1: 1 / 16 },
  { id: 'magU', store: 'f16', q0: 0, q1: 1 },
];
const ID_BASE = 2n ** 60n;
// Every value is exact in its store; every 5th mass and 7th band is absent (NaN).
const massOf = (r: number) => (r % 5 === 0 ? NaN : 8 + (r % 16) / 16);
const bandOf = (r: number) => (r % 7 === 0 ? NaN : 10 + (r % 16) / 2);

function infoInput(bumpRow = -1): OctreeInfoInput {
  const rows = Array.from({ length: N }, (_, r) => r);
  return {
    schema: INFO_SCHEMA,
    columns: new Map<ColumnId, Float32Array | BigUint64Array>([
      ['objId', BigUint64Array.from(rows, (r) => ID_BASE + BigInt(r))],
      ['specZ', Float32Array.from(rows, (r) => (r === bumpRow ? 0.5 : r * 1e-4))],
      ['logMass', Float32Array.from(rows, massOf)],
      ['magU', Float32Array.from(rows, bandOf)],
    ]),
  };
}

/** A chunk two below the index (its parent is a chunk) holding both real and blob records. */
const deepChunk = (objects: OctreeObjects) =>
  objects.chunks.findIndex(
    (c) =>
      c.parent !== null &&
      c.sourceRows.includes(NO_SOURCE_ROW) &&
      c.sourceRows.some((r) => r !== NO_SOURCE_ROW),
  );

describe('writeOctreeCatalog with info objects', () => {
  const dirs: string[] = [];
  const tempDir = () => {
    const d = fs.mkdtempSync(join(tmpdir(), 'octree-info-'));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("a record's info row is its input row's values", () => {
    const objects = nestedObjects(3);
    const dir = tempDir();
    const header = writeOctreeCatalog(objects, meta(), dir, 'stars', infoInput());
    const k = deepChunk(objects);
    expect(k).toBeGreaterThanOrEqual(0);
    const ref = header.chunkDirectory![k]!;
    const info = decodeOctreeInfo(read(join(dir, 'stars', octreeChunkInfoFileName(ref))), [
      'objId',
    ]);
    const col = (id: ColumnId) => Array.from(info.columns.get(id)! as ArrayLike<number | bigint>);
    const [objId, specZ, logMass, magU] = [col('objId'), col('specZ'), col('logMass'), col('magU')];
    const sourceRows = objects.chunks[k]!.sourceRows;
    expect(info.header.records).toBe(ref.records);
    let blobs = 0;
    sourceRows.forEach((r, i) => {
      if (r === NO_SOURCE_ROW) {
        blobs++;
        expect([objId[i], specZ[i], logMass[i], magU[i]]).toEqual([0n, NaN, 0, NaN]);
        return;
      }
      expect(objId[i]).toBe(ID_BASE + BigInt(r));
      expect(specZ[i]).toBe(Math.fround(r * 1e-4));
      expect(logMass[i]).toBe(Number.isNaN(massOf(r)) ? 0 : massOf(r));
      expect(magU[i]).toEqual(bandOf(r));
    });
    expect(blobs).toBeGreaterThan(0);
    expect(blobs).toBeLessThan(sourceRows.length);

    const indexInfo = decodeOctreeInfo(read(join(dir, 'stars.info.bin')), ['objId']);
    expect(indexInfo.header.records).toBe(header.records);
  });

  it('changing one info byte renames both files of the pair', () => {
    const objects = nestedObjects(3);
    const k = deepChunk(objects);
    const bumped = Array.from(objects.chunks[k]!.sourceRows).find((r) => r !== NO_SOURCE_ROW)!;
    const [dirA, dirB] = [tempDir(), tempDir()];
    const a = writeOctreeCatalog(objects, meta(), dirA, 'stars', infoInput());
    const b = writeOctreeCatalog(objects, meta(), dirB, 'stars', infoInput(bumped));

    const [refA, refB] = [a.chunkDirectory![k]!, b.chunkDirectory![k]!];
    expect(refB.hash).not.toBe(refA.hash);
    const filesB = fs.readdirSync(join(dirB, 'stars'));
    expect(filesB).toContain(octreeChunkFileName(refB));
    expect(filesB).toContain(octreeChunkInfoFileName(refB));
    expect(filesB).not.toContain(octreeChunkFileName(refA));
    expect(filesB).not.toContain(octreeChunkInfoFileName(refA));
    // The render bytes did not move: the rename came from the info half alone.
    expect(read(join(dirB, 'stars', octreeChunkFileName(refB)))).toEqual(
      read(join(dirA, 'stars', octreeChunkFileName(refA))),
    );
    // A chunk off k's ancestor chain keeps its name: the hash is per pair, not per catalog.
    const ancestors = new Set<number>([k]);
    for (let p = objects.chunks[k]!.parent; p !== null; p = objects.chunks[p]!.parent) {
      ancestors.add(p);
    }
    const other = objects.chunks.findIndex((_, id) => !ancestors.has(id));
    expect(b.chunkDirectory![other]!.hash).toBe(a.chunkDirectory![other]!.hash);
  });

  it('chunkDirectory lists every chunk once, ascending recordBase, matching the files written', () => {
    const objects = nestedObjects(9);
    const dir = tempDir();
    const header = writeOctreeCatalog(objects, meta(), dir, 'stars', infoInput());
    const directory = header.chunkDirectory!;

    expect(directory.map((r) => r.id).sort((x, y) => x - y)).toEqual(
      objects.chunks.map((_, id) => id),
    );
    directory.forEach((r, i) => {
      if (i > 0) expect(r.recordBase).toBeGreaterThan(directory[i - 1]!.recordBase);
      expect(r.recordBase).toBe(objects.chunks[r.id]!.recordBase);
    });
    const expected = directory.flatMap((r) => [octreeChunkFileName(r), octreeChunkInfoFileName(r)]);
    expect(fs.readdirSync(join(dir, 'stars')).sort()).toEqual(expected.sort());
    expect(fs.existsSync(join(dir, 'stars.info.bin'))).toBe(true);
  });
});
