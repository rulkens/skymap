/**
 * The renderer's chunk pool on a recording device: buffer sizes from the index
 * and slot count, the caps it refuses past, and the order a landing or evicted
 * chunk's writes reach the queue (a root must never refine over rows that are
 * not its chunk's).
 */
import { describe, it, expect, vi } from 'vitest';

import { createStarCatalogRenderer } from '../../../../src/layers/starCatalog/render/starCatalogRenderer';
import {
  CUT_NODE_WORDS,
  NODE_BITS_WORD,
  NODE_RESIDENT_BIT,
  OPACITY_CHANNELS,
  WORD_BYTES,
} from '../../../../src/layers/starCatalog/render/starCutLayout';
import { NO_CHUNK_REF, STAR_COLUMN_SCHEMA } from '../../../../src/data/octree/octreeFormat';
import { Source } from '../../../../src/data/sources';
import { STAR_FOCUS_AT_REST } from '../../../fixtures/starFocusAtRest';
import type { StarOctree } from '../../../../src/@types/data/starCatalog/StarOctree';
import type { StarChunk } from '../../../../src/@types/data/starCatalog/StarChunk';
import type { StarColumns } from '../../../../src/@types/data/starCatalog/StarColumns';
import type { StarCutInputs } from '../../../../src/layers/starCatalog/@types/StarCutInputs';

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
      const buffer = { label: d.label ?? '', size: d.size, destroy: vi.fn() };
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
        (buf: { label: string }, offset: number, data: ArrayBufferView | ArrayBuffer) => {
          writes.push({ label: buf.label, offset, bytes: data.byteLength, data });
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
): StarOctree {
  const chunkCount = over.chunks ?? 3;
  const level = Uint8Array.of(...new Array(9).fill(1), 3);
  const morton = Uint32Array.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 0);
  const ownCount = Uint32Array.of(...new Array(9).fill(5), 45);
  const firstRecord = Uint32Array.from({ length: 10 }, (_, i) => i * 6);
  return {
    grid: { bits: 4, origin: [0, 0, 0], cellEdge: 1 },
    starCount: 0,
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
      level: 1,
      morton: i,
      hash: '',
      bytes: 0,
      nodes: 1,
      records: 3,
    })),
    chunkCapacity: over.chunkCapacity ?? 50,
    chunkNodeCap: over.chunkNodeCap ?? 7,
    recordOrdinalBase: Uint32Array.of(100),
  };
}

/** Chunk 1 (root: level 1, Morton 1, index row 1): one level-0 row with 3 own records. */
const CHUNK: StarChunk = {
  ref: 1,
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
const SLOT_ROWS = `star-cut-slot-rows-${Source.GaiaStars}`;
const ROW_BYTES = CUT_NODE_WORDS * WORD_BYTES;

describe('starCatalogRenderer chunk pool', () => {
  it('upload sizes the pool from the index and the slot count', () => {
    const { device, sizeOf } = recordingDevice();
    createStarCatalogRenderer(device, 'rgba16float').upload(Source.GaiaStars, octreeOf(), 2);
    expect(sizeOf(NODES)).toBe((10 + 14) * 24);
    expect(sizeOf(OPACITY)).toBe(24 * 2 * 4);
    expect(sizeOf(RECORDS)).toBe((100 + 100) * 8);
  });

  it('upload throws naming the slot count that fits when the record cap is exceeded', () => {
    const { device } = recordingDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    expect(() =>
      renderer.upload(Source.GaiaStars, octreeOf({ chunkCapacity: 2 ** 25 }), 3),
    ).toThrow(/1 slot/);
    expect([...renderer.loadedCatalogs()]).toEqual([]);
  });

  it('an index with no chunks gets no pool rows and still draws', () => {
    const { device, sizeOf, encoder } = recordingDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, octreeOf({ chunks: 0 }), 256);
    expect(sizeOf(NODES)).toBe(10 * 24);
    expect(sizeOf(RECORDS)).toBe(100 * 8);
    renderer.setFrameCut(frame(0));
    renderer.encodeCut(encoder, () => ({}));
    expect(renderer.pickResources().leafDraw(Source.GaiaStars)).not.toBeNull();
    expect([...renderer.loadedCatalogs()].map((c) => c.source)).toEqual([Source.GaiaStars]);
  });

  it("uploadChunk writes the rows and records before the root's resident bit; evictChunk clears the bit first", () => {
    const { device, writes } = recordingDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, octreeOf(), 2);
    const nodeBase = 10 + 1 * 7;
    const recordBase = 100 + 1 * 50;

    writes.length = 0;
    renderer.uploadChunk(Source.GaiaStars, 1, CHUNK);
    const landed = writes.map((w) => [w.label, w.offset, w.bytes]);
    expect(landed).toEqual([
      [RECORDS, recordBase * 8, 3 * 8],
      [NODES, nodeBase * ROW_BYTES, 7 * ROW_BYTES],
      [SLOT_ROWS, 1 * WORD_BYTES, WORD_BYTES],
      [OPACITY, nodeBase * OPACITY_CHANNELS * 4, 7 * OPACITY_CHANNELS * 4],
      [NODES, 1 * ROW_BYTES, ROW_BYTES],
    ]);
    expect([...(writes[2]!.data as Uint32Array)]).toEqual([CHUNK.nodes.count]);
    const rootRow = writes.at(-1)!.data as Uint32Array;
    expect(rootRow[NODE_BITS_WORD]! & NODE_RESIDENT_BIT).toBe(NODE_RESIDENT_BIT);

    writes.length = 0;
    renderer.evictChunk(Source.GaiaStars, 1);
    expect(writes.map((w) => [w.label, w.offset, w.bytes])).toEqual([
      [NODES, 1 * ROW_BYTES, ROW_BYTES],
      [SLOT_ROWS, 1 * WORD_BYTES, WORD_BYTES],
    ]);
    expect([...(writes[1]!.data as Uint32Array)]).toEqual([0]);
    expect((writes[0]!.data as Uint32Array)[NODE_BITS_WORD]! & NODE_RESIDENT_BIT).toBe(0);
  });

  it("recordOrdinal and poolRecordIndex map a resident chunk's records both ways, and nothing once evicted", () => {
    const { device } = recordingDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    const octree = { ...octreeOf(), recordOrdinalBase: Uint32Array.of(100, 103, 106, 109) };
    renderer.upload(Source.GaiaStars, octree, 2);
    renderer.uploadChunk(Source.GaiaStars, 1, CHUNK);
    // Chunk 1's third record: pool 100 + 1·50 + 2, ordinal 103 + 2.
    expect(renderer.recordOrdinal(Source.GaiaStars, 152)).toBe(105);
    expect(renderer.poolRecordIndex(Source.GaiaStars, 105)).toBe(152);
    expect(renderer.recordOrdinal(Source.GaiaStars, 42)).toBe(42);
    expect(renderer.recordOrdinal(Source.GaiaStars, 153)).toBeNull(); // past the chunk's records
    expect(renderer.recordOrdinal(Source.GaiaStars, 100)).toBeNull(); // slot 0 is empty

    renderer.evictChunk(Source.GaiaStars, 1);
    expect(renderer.recordOrdinal(Source.GaiaStars, 152)).toBeNull();
    expect(renderer.poolRecordIndex(Source.GaiaStars, 105)).toBeNull();
  });

  it("a landed chunk's opacity rows are zeroed in both the live and the capture state", () => {
    const { device, writes } = recordingDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, octreeOf(), 2);
    renderer.setFrameCut(frame(0));
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
    renderer.uploadChunk(Source.GaiaStars, 1, CHUNK);
    const at = (10 + 7) * OPACITY_CHANNELS * 4;
    const zeroed = writes.filter((w) => w.label.startsWith('star-cut-opacity-'));
    expect(zeroed.map((w) => [w.label, w.offset])).toEqual([
      [OPACITY, at],
      [`${OPACITY}-capture`, at],
    ]);
    for (const w of zeroed) expect([...(w.data as Float32Array)].every((v) => v === 0)).toBe(true);
  });
});
