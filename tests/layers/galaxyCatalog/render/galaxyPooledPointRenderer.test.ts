/**
 * The pooled galaxy renderer's chunk pool on a recording device: where a landing chunk's
 * records go, that they land before the cut marks its root resident, and the two
 * ordinal maps (the pick's snapshot against the live slots).
 */
import { describe, it, expect, vi } from 'vitest';

import { createGalaxyPooledPointRenderer } from '../../../../src/layers/galaxyCatalog/render/galaxyPooledPointRenderer';
import {
  CUT_NODE_WORDS,
  NODE_BITS_WORD,
  NODE_RESIDENT_BIT,
  WORD_BYTES,
} from '../../../../src/services/gpu/octree/octreeCutLayout';
import { NO_CHUNK_REF } from '../../../../src/data/octree/octreeFormat';
import { GALAXY_GPU_RECORD_WORDS } from '../../../../src/data/galaxyCatalog/galaxyGpuRecordWords';
import { GALAXY_COLUMN_SCHEMA } from '../../../../src/data/octree/galaxyOctreeFamily';
import { Source } from '../../../../src/data/sources';
import type { GalaxyColumns } from '../../../../src/@types/data/galaxyCatalog/GalaxyColumns';
import type { Octree } from '../../../../src/@types/octree/Octree';
import type { OctreeChunk } from '../../../../src/@types/octree/OctreeChunk';
import type { FocusUniformsBgl } from '../../../../src/@types/rendering/FocusUniformsBgl';
import type { GalaxyPointDrawSettings } from '../../../../src/@types/rendering/GalaxyPointDrawSettings';
import type { OctreeCutInputs } from '../../../../src/@types/octree/OctreeCutInputs';

type Write = { label: string; offset: number; bytes: number; data: ArrayBufferView | ArrayBuffer };

function recordingDevice() {
  const writes: Write[] = [];
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn((d: GPUBufferDescriptor) => ({
      label: d.label ?? '',
      size: d.size,
      destroy: vi.fn(),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({})),
    queue: {
      submit: vi.fn(),
      writeBuffer: vi.fn((buf: { label: string }, offset: number, data: ArrayBufferView) => {
        const copy = ArrayBuffer.isView(data) ? (data as Uint32Array).slice() : data;
        writes.push({ label: buf.label, offset, bytes: copy.byteLength, data: copy });
      }),
    },
  };
  return { device: device as unknown as GPUDevice, writes };
}

function columns(count: number): GalaxyColumns {
  const f = () => new Float32Array(count);
  return {
    count,
    offset: new Uint16Array(3 * count),
    absMag: f(),
    colourIndex: f(),
    axisRatio: f(),
    pa: f(),
    logSize: f(),
    flags: f(),
    angularWeight: f(),
  };
}

const row = (count: number, ownCount: number[], chunkRef: number[], level: number[]) => ({
  count,
  morton: Uint32Array.from({ length: count }, (_, i) => i),
  level: Uint8Array.from(level),
  childMask: Uint8Array.from(level, (l) => (l > 0 ? 1 : 0)),
  firstRecord: Uint32Array.from(ownCount, (_, i) =>
    ownCount.slice(0, i).reduce((a, n) => a + n + 1, 0),
  ),
  ownCount: Uint32Array.from(ownCount),
  blobCount: new Uint32Array(count).fill(4),
  chunkRef: Uint32Array.from(chunkRef),
});

/** Index: two level-1 rows (rows 0–1 root chunks 0–1), then the level-2 root; 3 own records and a blob each. */
const OCTREE: Octree<GalaxyColumns> = {
  family: 'galaxy',
  grid: { bits: 4, origin: [10, 10, 10], cellEdge: 1 },
  recordCount: 100,
  columns: GALAXY_COLUMN_SCHEMA,
  nodes: row(3, [3, 3, 3], [0, 1, NO_CHUNK_REF], [1, 1, 2]),
  records: columns(12),
  chunks: [0, 1].map((id) => ({
    id,
    level: 1,
    morton: id,
    roots: [id],
    hash: '',
    bytes: 0,
    nodes: 1,
    records: 5,
    recordBase: 12 + 5 * id,
  })),
  chunkCount: 2,
  chunkCapacity: 8,
  chunkNodeCap: 4,
};

const chunkOf = (id: number): OctreeChunk<GalaxyColumns> => ({
  ref: OCTREE.chunks[id]!,
  parent: null,
  nodes: { ...row(1, [5], [NO_CHUNK_REF], [0]), morton: Uint32Array.of(8 * id) },
  records: columns(5),
  chunks: [],
});

const STATS = { magOffset: 0, medianAbsMag: -20 };
const RECORDS = `galaxy-pooled-records-${Source.Glade}`;
const NODES = `galaxy-cut-nodes-${Source.Glade}`;
const RECORD_BYTES = GALAXY_GPU_RECORD_WORDS * WORD_BYTES;

function makeRenderer() {
  const { device, writes } = recordingDevice();
  const renderer = createGalaxyPooledPointRenderer({
    device,
    targetFormat: 'rgba16float',
    focusBgl: {} as FocusUniformsBgl,
  });
  renderer.upload(Source.Glade, OCTREE, 2, STATS);
  return { renderer, writes };
}

describe('galaxyPooledPointRenderer chunk pool', () => {
  it('upload throws when the header overrides the colourIndex step', () => {
    const { device } = recordingDevice();
    const renderer = createGalaxyPooledPointRenderer({
      device,
      targetFormat: 'rgba16float',
      focusBgl: {} as FocusUniformsBgl,
    });
    const columnsWithStep = GALAXY_COLUMN_SCHEMA.map((c) =>
      c.id === 'colourIndex' ? { ...c, q1: 3 / 255 } : c,
    );
    expect(() =>
      renderer.upload(Source.Glade, { ...OCTREE, columns: columnsWithStep }, 2, STATS),
    ).toThrow(/colourIndex/);
  });

  it("the pooled renderer writes a chunk's records at the slot's pool offset and evicts them", () => {
    const { renderer, writes } = makeRenderer();
    writes.length = 0;
    renderer.uploadChunk(Source.Glade, 1, chunkOf(1), null);
    const rootBits = 1 * CUT_NODE_WORDS * WORD_BYTES + NODE_BITS_WORD * WORD_BYTES;
    const records = writes.findIndex((w) => w.label === RECORDS);
    const resident = writes.findIndex((w) => w.label === NODES && w.offset === rootBits);
    expect(writes[records]).toMatchObject({
      offset: (12 + 1 * 8) * RECORD_BYTES,
      bytes: 5 * RECORD_BYTES,
    });
    // A root marked resident over records not yet written would draw the slot's last occupant.
    expect(records).toBeLessThan(resident);
    expect((writes[resident]!.data as Uint32Array)[0]! & NODE_RESIDENT_BIT).toBe(NODE_RESIDENT_BIT);
    expect(renderer.poolRecordIndex(Source.Glade, 17 + 2)).toBe(12 + 8 + 2);

    writes.length = 0;
    renderer.evictChunk(Source.Glade, 1, null);
    const cleared = writes.find((w) => w.label === NODES && w.offset === rootBits)!;
    expect((cleared.data as Uint32Array)[0]! & NODE_RESIDENT_BIT).toBe(0);
    expect(renderer.poolRecordIndex(Source.Glade, 17 + 2)).toBeNull();
  });

  it('recordOrdinal reads the pick snapshot, poolRecordIndex the live slots', () => {
    const { renderer } = makeRenderer();
    renderer.uploadChunk(Source.Glade, 1, chunkOf(0), null);
    renderer.snapshotPickSlots();
    // Chunk 0 leaves slot 1 and chunk 1 takes it between the pick draw and its readback.
    renderer.evictChunk(Source.Glade, 1, null);
    renderer.uploadChunk(Source.Glade, 1, chunkOf(1), null);

    // Pool row 12 + 8 + 2 as drawn held chunk 0's third record (ordinal 12 + 2).
    expect(renderer.recordOrdinal(Source.Glade, 22)).toBe(14);
    expect(renderer.poolRecordIndex(Source.Glade, 14)).toBeNull();
    expect(renderer.poolRecordIndex(Source.Glade, 19)).toBe(22);
  });

  it("draw rewrites the blob words of the source's pooled uniform from the tuning it is handed", () => {
    const { renderer, writes } = makeRenderer();
    const inputs = { cut: { sources: [{ source: Source.Glade }] } };
    renderer.setFrameCut(inputs as unknown as OctreeCutInputs, true);
    writes.length = 0;
    const pass = { setBindGroup: vi.fn(), setPipeline: vi.fn(), drawIndirect: vi.fn() };
    const settings = {
      viewSlot: 0,
      provenance: {
        orientation: { highlight: false, filter: 'all' },
        size: { highlight: false, filter: 'all' },
      },
      camPosWorld: [0, 0, 0],
      fadeOpacityOf: () => 1,
    } as unknown as GalaxyPointDrawSettings;
    const blob = { blobGlowOverlap: 2.5, blobPeakCap: 0.3, blobGain: 0.4 };
    const encoder = pass as unknown as GPURenderPassEncoder;
    renderer.draw(encoder, new Float32Array(16), [800, 600], settings, false, blob);
    // pooledVertex.wesl's PooledRecordUniforms: gridOriginMpc, absMagQ0, absMagQ1, magOffset,
    // medianAbsMag, then these three.
    const words = writes.find((w) => w.label === `galaxy-pooled-uniform-${Source.Glade}`)!;
    expect(words.offset).toBe(7 * 4);
    expect([...(words.data as Float32Array)]).toEqual([2.5, Math.fround(0.3), Math.fround(0.4)]);
  });
});
