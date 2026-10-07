/**
 * Parity guard: the star cut's WESL declarations are hand-mirrored from
 * `starCutLayout.ts` (`?static` linking injects no values). A drift is
 * invisible until the GPU addresses the wrong word, so the test reads the
 * shader text and compares: every `const`, the struct field order and byte
 * offsets, the workgroup sizes and array lengths. Patterns of
 * `constants.parity.test.ts` and `atmosphereUniformsLayout.parity.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as layout from '../../../../src/layers/starCatalog/render/starCutLayout';
import {
  AGG_DRAW_BYTE_OFFSET,
  CUT_DRAWS_WORDS,
  CUT_HIST_WORDS,
  CUT_MAX_VIEWS,
  CUT_NODE_WORDS,
  CUT_UNIFORM_BYTES,
  CUT_WORKGROUP,
  FLOATS_PER_VIEW,
  WORD_BYTES,
  packStarCutNodes,
  writeStarCutUniforms,
} from '../../../../src/layers/starCatalog/render/starCutLayout';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';

function shader(file: string): string {
  return readFileSync(join(process.cwd(), 'src/services/gpu/shaders/starCatalog', file), 'utf-8');
}

const stripComments = (text: string) => text.replace(/\/\/.*$/gm, '');

/** Every `const NAME: u32|f32 = <expr>;`, an expression evaluated over earlier constants. */
function weslConsts(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const re = /const\s+(\w+)\s*:\s*(?:u32|f32)\s*=\s*([^;]+);/g;
  for (const [, name, expr] of stripComments(text).matchAll(re)) {
    const js = expr!
      .replace(/\b(\d+(?:\.\d+)?(?:e-?\d+)?)[uf]\b/g, '$1')
      .replace(/\b[A-Z_]+\b/g, (id) => {
        const known = out.get(id);
        if (known === undefined) throw new Error(`const ${name} uses unknown ${id}`);
        return String(known);
      });
    out.set(name!, Function(`return (${js});`)() as number);
  }
  return out;
}

const WGSL_TYPES: Record<string, { align: number; size: number }> = {
  f32: { align: 4, size: 4 },
  u32: { align: 4, size: 4 },
  'vec3<i32>': { align: 16, size: 12 },
  'vec3<f32>': { align: 16, size: 12 },
};

type Field = { name: string; byteOffset: number };

/** Field names and byte offsets of one struct, in declaration order. */
function structFields(text: string, name: string): { fields: Field[]; arrayLength: number } {
  const body = stripComments(text).match(new RegExp(`struct\\s+${name}\\s*\\{([^}]*)\\}`))?.[1];
  if (!body) throw new Error(`struct ${name} not found`);
  const fields: Field[] = [];
  let cursor = 0;
  let arrayLength = 0;
  for (const line of body.split('\n').map((l) => l.trim().replace(/,$/, ''))) {
    if (line === '') continue;
    const [fieldName, type] = line.split(/:\s*(.*)/s).map((part) => part.trim()) as [
      string,
      string,
    ];
    const array = /^array<vec4<f32>,\s*(\d+)>$/.exec(type);
    const spec = array ? { align: 16, size: 16 * Number(array[1]) } : WGSL_TYPES[type];
    if (!spec) throw new Error(`unhandled WESL type '${type}' on ${fieldName}`);
    if (array) arrayLength = Number(array[1]);
    const byteOffset = Math.ceil(cursor / spec.align) * spec.align;
    fields.push({ name: fieldName, byteOffset });
    cursor = byteOffset + spec.size;
  }
  return { fields, arrayLength };
}

const cut = shader('cut.wesl');
const cutIo = shader('cutIo.wesl');

describe('starCatalog cut WESL constants <-> starCutLayout.ts', () => {
  // Masks are the shader's own derivations; the TS side keeps only the widths.
  const expected: Record<string, number> = {
    CUT_BINS: layout.CUT_BINS,
    CUT_BINS_PER_OCTAVE: layout.CUT_BINS_PER_OCTAVE,
    DRAW_RECORD_WORDS: layout.DRAW_RECORD_WORDS,
    // WebGPU's indirect record is (vertexCount, instanceCount, ...): instanceCount is word 1.
    LEAF_INSTANCES: 1,
    AGG_INSTANCES: AGG_DRAW_BYTE_OFFSET / WORD_BYTES + 1,
    MIN_DIST_SQ: layout.MIN_DIST_SQ,
    HALF_DIAGONAL: layout.HALF_DIAGONAL,
    GRID_AXIS_BITS: layout.GRID_AXIS_BITS,
    LEVEL_BITS: layout.LEVEL_BITS,
    RECORD_COUNT_SHIFT: layout.RECORD_COUNT_SHIFT,
    LEAF_BLOCK_SHIFT: layout.LEAF_BLOCK_SHIFT,
    LEAF_BLOCK_INDEX_SHIFT: layout.LEAF_BLOCK_INDEX_SHIFT,
    GRID_AXIS_MASK: 2 ** layout.GRID_AXIS_BITS - 1,
    NODE_LEVEL_MASK: 2 ** layout.LEVEL_BITS - 1,
    NODE_AGGREGATE_BIT: 2 ** layout.LEVEL_BITS,
    LEAF_ENTRY_NODE_MASK: 2 ** layout.LEAF_BLOCK_INDEX_SHIFT - 1,
    CUT_MAX_VIEWS: layout.CUT_MAX_VIEWS,
  };

  it('every WESL const equals its TS twin, and none lacks one', () => {
    const wesl = new Map([...weslConsts(cut), ...weslConsts(cutIo)]);
    expect([...wesl.keys()].sort()).toEqual(Object.keys(expected).sort());
    for (const [name, value] of Object.entries(expected)) {
      expect(wesl.get(name), name).toBe(value);
    }
  });

  it('workgroup sizes, array lengths and the aggregate record offset agree exactly', () => {
    const sizes = [...cut.matchAll(/@workgroup_size\((\d+)\)\s*fn\s+(\w+)/g)].map(
      ([, size, entry]) => [entry, Number(size)],
    );
    expect(sizes).toEqual([
      ['histogram', CUT_WORKGROUP],
      ['pickThreshold', 1],
      ['emit', CUT_WORKGROUP],
    ]);
    expect(cut).toContain(`array<atomic<u32>, ${CUT_HIST_WORDS}>`);
    expect(cut).toContain(`array<atomic<u32>, ${CUT_DRAWS_WORDS}>`);
    expect(AGG_DRAW_BYTE_OFFSET).toBe(layout.DRAW_RECORD_WORDS * WORD_BYTES);
  });
});

describe('struct CutUniforms', () => {
  const { fields, arrayLength } = structFields(cutIo, 'CutUniforms');
  const wordOf: Record<string, number> = {
    camCell: layout.CAM_CELL_INT_INDEX,
    cellEdgeMpc: layout.CELL_EDGE_MPC_FLOAT_INDEX,
    camFrac: layout.CAM_FRAC_FLOAT_INDEX,
    refineThresholdSq: layout.REFINE_THRESHOLD_SQ_FLOAT_INDEX,
    fadeStep: layout.FADE_STEP_FLOAT_INDEX,
    budgetTypical: layout.BUDGET_TYPICAL_U32_INDEX,
    worldSpread: layout.WORLD_SPREAD_FLOAT_INDEX,
    leafMarginRad: layout.LEAF_MARGIN_RAD_FLOAT_INDEX,
    viewCount: layout.VIEW_COUNT_U32_INDEX,
    nodeCount: layout.NODE_COUNT_U32_INDEX,
    opacity: layout.OPACITY_FLOAT_INDEX,
    _pad: layout.PLANES_FLOAT_INDEX - 1,
    planes: layout.PLANES_FLOAT_INDEX,
  };

  it('declares the fields in the order and at the byte offsets the TS indices name', () => {
    expect(fields.map((f) => [f.name, f.byteOffset / WORD_BYTES])).toEqual(
      Object.entries(wordOf).sort(([, a], [, b]) => a - b),
    );
    expect(arrayLength).toBe(CUT_MAX_VIEWS * 6);
    expect(fields.at(-1)!.byteOffset + arrayLength * 16).toBe(CUT_UNIFORM_BYTES);
  });

  it('writeStarCutUniforms lands each value where the struct says', () => {
    const catalog = {
      cellEdgePc: 2,
      gridOrigin: [0, 0, 0],
      nodes: new Array(5),
    } as unknown as StarCatalog;
    const planes = new Float32Array(FLOATS_PER_VIEW).fill(0.75);
    const buf = new ArrayBuffer(CUT_UNIFORM_BYTES);
    writeStarCutUniforms(buf, catalog, [0, 0, 0], {
      refineThreshold: 0.5,
      fadeStep: 0.125,
      budgetTypical: 777,
      worldSpread: 3.5,
      leafMarginRad: 0.0625,
      opacity: 0.25,
      planes,
    });
    const at = (name: string) => fields.find((f) => f.name === name)!.byteOffset / WORD_BYTES;
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);
    expect(f32[at('cellEdgeMpc')]).toBeCloseTo(2e-6, 12);
    expect(f32[at('refineThresholdSq')]).toBe(0.25);
    expect(f32[at('fadeStep')]).toBe(0.125);
    expect(u32[at('budgetTypical')]).toBe(777);
    expect(f32[at('worldSpread')]).toBe(3.5);
    expect(f32[at('leafMarginRad')]).toBe(0.0625);
    expect(u32[at('viewCount')]).toBe(1);
    expect(u32[at('nodeCount')]).toBe(5);
    expect(f32[at('opacity')]).toBe(0.25);
    expect(f32[at('planes')]).toBe(0.75);
  });
});

describe('struct CutNode', () => {
  const { fields } = structFields(cutIo, 'CutNode');
  const wordOf: Record<string, number> = {
    grid: layout.NODE_GRID_WORD,
    firstRecord: layout.NODE_FIRST_RECORD_WORD,
    bits: layout.NODE_BITS_WORD,
    subtreeCount: layout.NODE_SUBTREE_COUNT_WORD,
    parent: layout.NODE_PARENT_WORD,
    refineDelta: layout.NODE_REFINE_DELTA_WORD,
  };

  it('declares the fields in the order and at the word slots the TS indices name', () => {
    expect(fields.map((f) => [f.name, f.byteOffset / WORD_BYTES])).toEqual(
      Object.entries(wordOf).sort(([, a], [, b]) => a - b),
    );
    expect(fields.length).toBe(CUT_NODE_WORDS);
  });

  it('packStarCutNodes lands each value where the struct says', () => {
    const catalog: StarCatalog = {
      starCount: 3,
      nodeCount: 2,
      mortonBitsPerAxis: 9,
      cellEdgePc: 1,
      gridOrigin: [0, 0, 0],
      nodes: [
        { mortonIndex: 1, level: 0, childMask: 0, firstRecord: 40, recordCount: 3 },
        { mortonIndex: 0, level: 1, childMask: 0b10, firstRecord: 43, recordCount: 1 },
      ],
      records: new Uint8Array(6 * 44),
    };
    const words = packStarCutNodes(catalog);
    const at = (node: number, name: string) =>
      words[node * CUT_NODE_WORDS + fields.find((f) => f.name === name)!.byteOffset / WORD_BYTES];
    expect(at(0, 'grid')).toBe(1);
    expect(at(0, 'firstRecord')).toBe(40);
    expect(at(0, 'bits')).toBe((3 << 8) | 0);
    expect(at(0, 'subtreeCount')).toBe(3);
    expect(at(0, 'parent')).toBe(1);
    expect(at(1, 'bits')).toBe((1 << 8) | (1 << 4) | 1);
    expect(at(1, 'refineDelta')).toBe(2);
  });
});
