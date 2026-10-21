/**
 * The renderer's chunk pool on a recording device: buffer sizes from the index
 * and pool shape, the caps it refuses past, and the order a landing or evicted
 * chunk's writes reach the queue (a root must never refine over rows that are
 * not its chunk's).
 */
import { describe, it, expect, vi } from 'vitest';

import { createStarCatalogRenderer } from '../../../../src/layers/starCatalog/render/starCatalogRenderer';
import {
  CUT_NODE_WORDS,
  NODE_BITS_WORD,
  NODE_PARENT_WORD,
  NODE_REFINE_DELTA_WORD,
  NODE_RESIDENT_BIT,
  OPACITY_CHANNELS,
  WORD_BYTES,
} from '../../../../src/services/gpu/octree/octreeCutLayout';
import { NO_CHUNK_REF } from '../../../../src/data/octree/octreeFormat';
import { Source } from '../../../../src/data/sources';
import { STAR_FOCUS_AT_REST } from '../../../fixtures/starFocusAtRest';
import type { Octree } from '../../../../src/@types/octree/Octree';
import type { OctreeChunk } from '../../../../src/@types/octree/OctreeChunk';
import type { StarColumns } from '../../../../src/@types/data/starCatalog/StarColumns';
import type { StarCutInputs } from '../../../../src/layers/starCatalog/@types/StarCutInputs';
import { STAR_COLUMN_SCHEMA } from '../../../../src/data/octree/starOctreeFamily';
import { octreePoolShape } from '../../../../src/utils/octree/octreePoolShape';

type Write = { label: string; offset: number; bytes: number; data: ArrayBufferView | ArrayBuffer };

function recordingDevice() {
  const buffers: { label: string; size: number }[] = [];
  const writes: Write[] = [];
  const pass = {
    setBindGroup: vi.fn(),
    setPipeline: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    end: vi.fn(),
  };
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn((d: GPUBufferDescriptor) => {
      const buffer = { label: d.label ?? '', size: d.size, usage: d.usage, destroy: vi.fn() };
      buffers.push(buffer);
      return buffer;
    }),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({})),
    createCommandEncoder: vi.fn(() => ({ beginComputePass: () => pass, finish: () => ({}) })),
    queue: {
      submit: vi.fn(),
      writeBuffer: vi.fn(
        (
          buf: { label: string; usage: number },
          offset: number,
          data: ArrayBufferView | ArrayBuffer,
          from = 0,
          count?: number,
        ) => {
          // WebGPU rejects a write into a buffer created without COPY_DST.
          if ((buf.usage & GPUBufferUsage.COPY_DST) === 0) {
            throw new Error(`writeBuffer into ${buf.label}, which lacks COPY_DST`);
          }
          // writeBuffer copies at the call, so the record does too; a typed array's
          // `from`/`count` are in elements.
          const copy = ArrayBuffer.isView(data)
            ? (data as Uint32Array).slice(from, count === undefined ? undefined : from + count)
            : data.slice(0);
          writes.push({ label: buf.label, offset, bytes: copy.byteLength, data: copy });
        },
      ),
    },
  };
  const encoder = { beginComputePass: () => pass } as unknown as GPUCommandEncoder;
  const sizeOf = (label: string) => buffers.find((b) => b.label === label)!.size;
  return { device: device as unknown as GPUDevice, writes, encoder, sizeOf };
}

function columns(count: number): StarColumns {
  return {
    count,
    offset: new Uint16Array(3 * count),
    absMag: new Float32Array(count),
    colourIndex: new Float32Array(count),
  };
}

/**
 * Ten index rows: nine level-1 rows with 5 own records and a blob (rows 0–2 are
 * the roots of chunks 0–2), then a level-3 root with 45 own records and a blob.
 */
function octreeOf(
  over: { chunks?: number; chunkCapacity?: number; chunkNodeCap?: number } = {},
): Octree<StarColumns> {
  const chunkCount = over.chunks ?? 3;
  const level = Uint8Array.of(...new Array(9).fill(1), 3);
  const morton = Uint32Array.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 0);
  const ownCount = Uint32Array.of(...new Array(9).fill(5), 45);
  const firstRecord = Uint32Array.from({ length: 10 }, (_, i) => i * 6);
  return {
    grid: { bits: 4, origin: [0, 0, 0], cellEdge: 1 },
    family: 'star',
    recordCount: 0,
    columns: STAR_COLUMN_SCHEMA,
    nodes: {
      count: 10,
      morton,
      level,
      childMask: new Uint8Array(10).fill(1),
      firstRecord,
      ownCount,
      blobCount: new Uint32Array(10).fill(9),
      chunkRef: Uint32Array.from({ length: 10 }, (_, i) => (i < chunkCount ? i : NO_CHUNK_REF)),
    },
    records: columns(100),
    chunks: Array.from({ length: chunkCount }, (_, i) => ({
      id: i,
      recordBase: 100 + 3 * i,
      level: 1,
      morton: i,
      roots: [i],
      hash: '',
      bytes: 0,
      nodes: 1,
      records: 3,
    })),
    chunkCapacity: over.chunkCapacity ?? 50,
    chunkNodeCap: over.chunkNodeCap ?? 7,
    chunkCount,
  };
}

/** Chunk 1 (root: level 1, Morton 1, index row 1): one level-0 row with 3 own records. */
const CHUNK: OctreeChunk<StarColumns> = {
  ref: octreeOf().chunks[1]!,
  parent: null,
  nodes: {
    count: 1,
    morton: Uint32Array.of(8),
    level: Uint8Array.of(0),
    childMask: Uint8Array.of(0),
    firstRecord: Uint32Array.of(0),
    ownCount: Uint32Array.of(3),
    blobCount: Uint32Array.of(0),
    chunkRef: Uint32Array.of(NO_CHUNK_REF),
  },
  records: columns(3),
  chunks: [],
};

function frame(nowMs: number): StarCutInputs {
  return {
    cut: {
      originMpc: [0, 0, 0],
      planes: new Float32Array(0),
      refineThreshold: 0.05,
      worldSpread: 1,
      leafMarginRad: 0,
      sources: [{ source: Source.GaiaStars, opacity: 1, drawBudget: 10 }],
    },
    nowMs,
    sizePx: 2.5,
    brightness: 1,
    glowOverlap: 1,
    aggregateIntensityCap: 0.06,
  };
}

const NODES = `star-cut-nodes-${Source.GaiaStars}`;
const RECORDS = `star-catalog-records-${Source.GaiaStars}`;
const OPACITY = `star-cut-opacity-${Source.GaiaStars}`;
const PAGE_ROWS = `star-cut-page-rows-${Source.GaiaStars}`;
const ROW_BYTES = CUT_NODE_WORDS * WORD_BYTES;
/** A root's residency writes: its `bits` word, then its `refineDelta` word. */
const rootWords = (row: number) => [
  [NODES, row * ROW_BYTES + NODE_BITS_WORD * WORD_BYTES],
  [NODES, row * ROW_BYTES + NODE_REFINE_DELTA_WORD * WORD_BYTES],
];
const word = (w: Write) => (w.data as Uint32Array)[0]!;
/** `slots` 50-record chunks' worth: records in runs of 64; 7-row chunks' rows in runs of 8, two per slot. */
const poolOf = (octree: Octree<StarColumns>, slots: number) =>
  octreePoolShape(octree, slots, 1 / 4);
/** Chunk 1's runs: the second record run (64) and the second row run (8). */
const SECOND = { records: 64, nodes: 8 };

describe('starCatalogRenderer chunk pool', () => {
  it('upload sizes the pool from the index and the pool shape', () => {
    const { device, sizeOf } = recordingDevice();
    const octree = octreeOf();
    createStarCatalogRenderer(device, 'rgba16float').upload(
      Source.GaiaStars,
      octree,
      poolOf(octree, 2),
    );
    // 128 records × 1/4 = 32 rows; one u32 per 8-row page.
    expect(sizeOf(NODES)).toBe((10 + 32) * 24);
    expect(sizeOf(OPACITY)).toBe(42 * 2 * 4);
    expect(sizeOf(PAGE_ROWS)).toBe((32 / 8) * 4);
    expect(sizeOf(RECORDS)).toBe((100 + 128) * 8);
  });

  it('upload throws when the record cap is exceeded', () => {
    const { device } = recordingDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    const octree = octreeOf({ chunkCapacity: 2 ** 25 });
    expect(() => renderer.upload(Source.GaiaStars, octree, poolOf(octree, 3))).toThrow(
      /record index/,
    );
    expect([...renderer.loadedCatalogs()]).toEqual([]);
  });

  it('an index with no chunks gets no pool rows and still draws', () => {
    const { device, sizeOf, encoder } = recordingDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    const octree = octreeOf({ chunks: 0 });
    renderer.upload(Source.GaiaStars, octree, poolOf(octree, 256));
    expect(sizeOf(NODES)).toBe(10 * 24);
    expect(sizeOf(RECORDS)).toBe(100 * 8);
    renderer.setFrameCut(frame(0), true);
    renderer.encodeCut(encoder, () => ({}));
    expect(renderer.pickResources().leafDraw(Source.GaiaStars)).not.toBeNull();
    expect([...renderer.loadedCatalogs()].map((c) => c.source)).toEqual([Source.GaiaStars]);
  });

  it("uploadChunk writes the rows and records at its runs before the root's resident bit; evictChunk clears the bit first", () => {
    const { device, writes } = recordingDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, octreeOf(), poolOf(octreeOf(), 2));
    const nodeBase = 10 + 8;
    const recordBase = 100 + 64;

    writes.length = 0;
    renderer.uploadChunk(Source.GaiaStars, 1, CHUNK, null, SECOND);
    const landed = writes.map((w) => [w.label, w.offset, w.bytes]);
    // Only the chunk's own row is written and marked live: its page is the run's first (8 / 8).
    expect(landed).toEqual([
      [RECORDS, recordBase * 8, 3 * 8],
      [NODES, nodeBase * ROW_BYTES, 1 * ROW_BYTES],
      [PAGE_ROWS, 1 * WORD_BYTES, WORD_BYTES],
      [OPACITY, nodeBase * OPACITY_CHANNELS * 4, 1 * OPACITY_CHANNELS * 4],
      ...rootWords(1).map((w) => [...w, WORD_BYTES]),
    ]);
    expect([...(writes[2]!.data as Uint32Array)]).toEqual([CHUNK.nodes.count]);
    expect(word(writes.at(-2)!) & NODE_RESIDENT_BIT).toBe(NODE_RESIDENT_BIT);

    writes.length = 0;
    renderer.evictChunk(Source.GaiaStars, 1, null);
    expect(writes.map((w) => [w.label, w.offset, w.bytes])).toEqual([
      ...rootWords(1).map((w) => [...w, WORD_BYTES]),
      [PAGE_ROWS, 1 * WORD_BYTES, WORD_BYTES],
    ]);
    expect([...(writes[2]!.data as Uint32Array)]).toEqual([0]);
    expect(word(writes[0]!) & NODE_RESIDENT_BIT).toBe(0);
    expect(word(writes[1]!)).toBe(0);
  });

  it('a chunk with several roots marks every root resident last and clears every root first', () => {
    const { device, writes } = recordingDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    const base = octreeOf({ chunks: 2 });
    // Chunk 1 holds the roots at index rows 1 and 2 (level 1, Morton 1 and 2).
    const octree: Octree<StarColumns> = {
      ...base,
      nodes: {
        ...base.nodes,
        chunkRef: Uint32Array.from({ length: 10 }, (_, i) =>
          i < 3 ? Math.min(i, 1) : NO_CHUNK_REF,
        ),
      },
      chunks: [base.chunks[0]!, { ...base.chunks[1]!, roots: [1, 2], nodes: 2, records: 5 }],
    };
    const chunk: OctreeChunk<StarColumns> = {
      ref: octree.chunks[1]!,
      parent: null,
      nodes: {
        count: 2,
        morton: Uint32Array.of(8, 16),
        level: Uint8Array.of(0, 0),
        childMask: Uint8Array.of(0, 0),
        firstRecord: Uint32Array.of(0, 3),
        ownCount: Uint32Array.of(3, 2),
        blobCount: Uint32Array.of(0, 0),
        chunkRef: Uint32Array.of(NO_CHUNK_REF, NO_CHUNK_REF),
      },
      records: columns(5),
      chunks: [],
    };
    renderer.upload(Source.GaiaStars, octree, poolOf(octree, 2));

    writes.length = 0;
    renderer.uploadChunk(Source.GaiaStars, 0, chunk, null, { records: 0, nodes: 0 });
    expect(writes.map((w) => [w.label, w.offset])).toEqual([
      [RECORDS, 100 * 8],
      [NODES, 10 * ROW_BYTES],
      [PAGE_ROWS, 0],
      [OPACITY, 10 * OPACITY_CHANNELS * 4],
      ...rootWords(1),
      ...rootWords(2),
    ]);
    const roots = writes.slice(-4).map(word);
    expect([roots[0]! & NODE_RESIDENT_BIT, roots[2]! & NODE_RESIDENT_BIT]).toEqual([
      NODE_RESIDENT_BIT,
      NODE_RESIDENT_BIT,
    ]);
    expect([roots[1], roots[3]]).toEqual([3 - 1, 2 - 1]);

    writes.length = 0;
    renderer.evictChunk(Source.GaiaStars, 0, null);
    expect(writes.map((w) => [w.label, w.offset])).toEqual([
      ...rootWords(1),
      ...rootWords(2),
      [PAGE_ROWS, 0],
    ]);
    expect([word(writes[0]!) & NODE_RESIDENT_BIT, word(writes[2]!) & NODE_RESIDENT_BIT]).toEqual([
      0, 0,
    ]);
  });

  it('a slot evicted and refilled between the pick draw and its readback resolves to the star that was drawn', () => {
    const { device } = recordingDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, octreeOf(), poolOf(octreeOf(), 2));
    renderer.uploadChunk(Source.GaiaStars, 1, CHUNK, null, SECOND);
    renderer.snapshotPickSlots();

    renderer.evictChunk(Source.GaiaStars, 1, null);
    renderer.uploadChunk(
      Source.GaiaStars,
      1,
      {
        ...CHUNK,
        ref: octreeOf().chunks[2]!,
        nodes: { ...CHUNK.nodes, morton: Uint32Array.of(16) },
      },
      null,
      SECOND,
    );
    // Chunk 1's third record as drawn (103 + 2), not chunk 2's (106 + 2).
    expect(renderer.recordOrdinal(Source.GaiaStars, 166)).toBe(105);
    // The inverse reads the live table: chunk 1 has left it, chunk 2 holds slot 1.
    expect(renderer.poolRecordIndex(Source.GaiaStars, 105)).toBeNull();
    expect(renderer.poolRecordIndex(Source.GaiaStars, 108)).toBe(166);
  });

  it("a landed chunk's opacity rows are zeroed in both the live and the capture state", () => {
    const { device, writes } = recordingDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, octreeOf(), poolOf(octreeOf(), 2));
    renderer.setFrameCut(frame(0), true);
    renderer.drawCut(
      {
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        drawIndirect: vi.fn(),
      } as unknown as GPURenderPassEncoder,
      {
        source: Source.GaiaStars,
        focus: STAR_FOCUS_AT_REST,
        stream: 'leaf',
        capture: true,
        vp: new Float32Array(16),
        viewportPx: [64, 64],
        pxPerRad: 100,
        sizePx: 2.5,
        brightness: 1,
        glowOverlap: 1,
        aggregateIntensityCap: 0.06,
        viewSlot: 1,
      },
    );

    writes.length = 0;
    renderer.uploadChunk(Source.GaiaStars, 1, CHUNK, null, SECOND);
    const at = (10 + 8) * OPACITY_CHANNELS * 4;
    const zeroed = writes.filter((w) => w.label.startsWith('star-cut-opacity-'));
    expect(zeroed.map((w) => [w.label, w.offset])).toEqual([
      [OPACITY, at],
      [`${OPACITY}-capture`, at],
    ]);
    for (const w of zeroed) expect([...(w.data as Float32Array)].every((v) => v === 0)).toBe(true);
  });
  it("a nested chunk's roots are written in its parent's slot rows", () => {
    const { device, writes } = recordingDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    // Index: level-2 row 0 roots chunk 0; the level-3 root. Chunk 0's level-1 row roots chunk 1.
    const row = (level: number, childMask: number, ownCount: number, chunkRef: number) => ({
      count: 1,
      morton: Uint32Array.of(0),
      level: Uint8Array.of(level),
      childMask: Uint8Array.of(childMask),
      firstRecord: Uint32Array.of(0),
      ownCount: Uint32Array.of(ownCount),
      blobCount: Uint32Array.of(3),
      chunkRef: Uint32Array.of(chunkRef),
    });
    const ref = (id: number, recordBase: number, records: number) => ({
      id,
      recordBase,
      records,
      level: 2 - id,
      morton: 0,
      roots: [0],
      hash: '',
      bytes: 0,
      nodes: 1,
    });
    const octree: Octree<StarColumns> = {
      ...octreeOf(),
      nodes: {
        count: 2,
        morton: Uint32Array.of(0, 0),
        level: Uint8Array.of(2, 3),
        childMask: Uint8Array.of(1, 1),
        firstRecord: Uint32Array.of(0, 1),
        ownCount: Uint32Array.of(0, 0),
        blobCount: Uint32Array.of(3, 3),
        chunkRef: Uint32Array.of(0, NO_CHUNK_REF),
      },
      records: columns(2),
      chunks: [ref(0, 2, 1)],
      chunkCount: 2,
    };
    const parent: OctreeChunk<StarColumns> = {
      ref: ref(0, 2, 1),
      parent: null,
      nodes: row(1, 1, 0, 1),
      records: columns(1),
      chunks: [ref(1, 3, 3)],
    };
    const child: OctreeChunk<StarColumns> = {
      ref: ref(1, 3, 3),
      parent: 0,
      nodes: row(0, 0, 3, NO_CHUNK_REF),
      records: columns(3),
      chunks: [],
    };
    renderer.upload(Source.GaiaStars, octree, poolOf(octree, 2));
    renderer.uploadChunk(Source.GaiaStars, 1, parent, null, SECOND);

    writes.length = 0;
    renderer.uploadChunk(Source.GaiaStars, 0, child, 1, { records: 0, nodes: 0 });
    // The parent's row sits at its row run: pool row 2 + 8; the child's own row at run 0, row 2.
    const parentRow = 2 + 8;
    expect(writes.slice(-2).map((w) => [w.label, w.offset])).toEqual(rootWords(parentRow));
    expect(word(writes.at(-2)!) & NODE_RESIDENT_BIT).toBe(NODE_RESIDENT_BIT);
    expect(word(writes.at(-1)!)).toBe(3 - 1);
    const childRows = writes.find((w) => w.label === NODES && w.offset === 2 * ROW_BYTES)!;
    expect((childRows.data as Uint32Array)[NODE_PARENT_WORD]).toBe(parentRow);

    writes.length = 0;
    renderer.evictChunk(Source.GaiaStars, 0, 1);
    expect(writes.slice(0, 2).map((w) => [w.label, w.offset])).toEqual(rootWords(parentRow));
    expect(word(writes[0]!) & NODE_RESIDENT_BIT).toBe(0);
  });
});
