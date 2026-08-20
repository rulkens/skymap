/**
 * earthSurfaceTile layout parity — the CPU packer and the WESL structs must
 * agree byte-for-byte, the `NodeParams` case `nodeParamsLayout.test.ts`
 * guards for the star pipeline, adapted here for `earthSurfaceTileLayout.ts`'s
 * three structs (`NodeParams`, `TileVertex`, `SurfaceTileUniforms`).
 *
 * The WESL `struct NodeParams` / `TileVertex` / `SurfaceTileUniforms`
 * (`shaders/bodies/earthSurfaceTile/io.wesl`) declare the field order + types
 * the GPU uses to address bytes; `earthSurfaceTileLayout.ts`'s
 * `writeSurfaceTileNodeParams` / `writeTileVertex` / `writeSurfaceTileUniforms`
 * restate those same offsets as hand-literal `view.set{Float32,Uint32}(N,
 * expr, true)` calls (array-element writers add a `base +`; the singleton
 * uniform writer doesn't). Nothing but this test cross-checks the two: a
 * WGSL field reorder without a matching TS move would silently scramble
 * every drawn tile's origin/uv/addressing, or its shading uniforms, with no
 * compiler signal.
 *
 * We read both files as TEXT (rather than importing the linked `?static`
 * WGSL) because the layout contract lives in the WESL struct's DECLARATION
 * order and the packer's offsets are literals inside the writer functions,
 * not an exported table -- parsing source is the only way to observe both
 * truths without restating either.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  NODE_PARAMS_BYTES,
  TILE_VERTEX_BYTES,
  SURFACE_TILE_UNIFORM_BYTES,
} from '../../../../../src/services/gpu/renderers/bodies/earthSurfaceTileLayout';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const ioWeslPath = resolve(repoRoot, 'src/services/gpu/shaders/bodies/earthSurfaceTile/io.wesl');
const layoutPath = resolve(repoRoot, 'src/services/gpu/renderers/bodies/earthSurfaceTileLayout.ts');

/** WGSL scalar kind a field's bytes carry -- the only distinction the writer makes. */
type Kind = 'float' | 'uint';

/** std140/std430 alignment + byte size for the subset these three structs use. */
const WESL_TYPES: Record<string, { align: number; size: number; kind: Kind; lanes: number }> = {
  f32: { align: 4, size: 4, kind: 'float', lanes: 1 },
  u32: { align: 4, size: 4, kind: 'uint', lanes: 1 },
  'vec2<f32>': { align: 8, size: 8, kind: 'float', lanes: 2 },
  'vec3<f32>': { align: 16, size: 12, kind: 'float', lanes: 3 },
  'mat4x4<f32>': { align: 16, size: 64, kind: 'float', lanes: 16 },
};

/** One scalar write the layout demands: a byte offset + the kind stored there + owning field. */
type ScalarWrite = { offset: number; kind: Kind; field: string };

function roundUp(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}

/**
 * Parse `struct NAME { ... }` from the WESL text into ordered `{ name, type }`
 * fields. io.wesl's fields carry multi-line leading doc comments, so comments
 * are stripped PER PHYSICAL LINE (not per comma-split segment, which the
 * star precedent's single-line-comment shape didn't need to handle) before
 * splitting each surviving `name: type,` line on its colon.
 */
function structFields(source: string, name: string): Array<{ name: string; type: string }> {
  const body = source.match(new RegExp(`struct\\s+${name}\\s*\\{([^}]*)\\}`))?.[1];
  if (!body) throw new Error(`struct ${name} not found in io.wesl`);
  return body
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [fieldName, type] = line
        .replace(/,$/, '')
        .split(':')
        .map((part) => part.trim());
      if (!fieldName || !type) throw new Error(`unparsable ${name} field: '${line}'`);
      return { name: fieldName, type };
    });
}

/**
 * Expand a struct to the ordered scalar writes std430 demands: a vecN
 * becomes N float writes at offset+0/+4/..., a scalar one write. Returns the
 * writes plus the struct's size (rounded up to its max member alignment).
 */
function structLayout(fields: Array<{ name: string; type: string }>): {
  writes: ScalarWrite[];
  structSize: number;
} {
  const writes: ScalarWrite[] = [];
  let cursor = 0;
  let maxAlign = 4;
  for (const { name, type } of fields) {
    const spec = WESL_TYPES[type];
    if (!spec) throw new Error(`unhandled WESL type '${type}' on field ${name}`);
    const offset = roundUp(cursor, spec.align);
    for (let lane = 0; lane < spec.lanes; lane++) {
      writes.push({ offset: offset + lane * 4, kind: spec.kind, field: name });
    }
    cursor = offset + spec.size;
    maxAlign = Math.max(maxAlign, spec.align);
  }
  return { writes, structSize: roundUp(cursor, maxAlign) };
}

/**
 * Which struct field a writer parameter expression feeds -- the sole
 * cross-language glue. `orientation[N]` is index-aware (N < 3 is column 0's
 * lane, etc) because `writeSurfaceTileUniforms` reads the SAME `orientation`
 * array for all three `rotCol0/1/2` fields -- the expression text alone
 * (`orientation[N]`) can't distinguish them without the index.
 */
function fieldForExpr(expr: string): string {
  if (/originRelCamMpc/.test(expr)) return 'originRelCamMpc';
  if (/vertexBase/.test(expr)) return 'vertexBase';
  if (/atlasUvOrigin/.test(expr)) return 'atlasUvOrigin';
  if (/atlasUvScale/.test(expr)) return 'atlasUvScale';
  if (/^position[XYZ]$/.test(expr)) return 'position';
  if (/^uv[XY]$/.test(expr)) return 'uv';
  if (/^tangent[XYZ]$/.test(expr)) return 'tangent';
  if (/^vp\[/.test(expr)) return 'vp';
  const orientationIndex = expr.match(/^orientation\[(\d+)\]/);
  if (orientationIndex) {
    const idx = Number(orientationIndex[1]);
    return idx < 3 ? 'rotCol0' : idx < 6 ? 'rotCol1' : 'rotCol2';
  }
  if (/^radiusMpc$/.test(expr)) return 'radiusMpc';
  if (/^vertsPerTile\b/.test(expr)) return 'vertsPerTile';
  if (/^roughnessBase$/.test(expr)) return 'roughnessBase';
  if (/^camPosRelBodyMpc\[/.test(expr)) return 'camPosRelBodyMpc';
  if (/^f0$/.test(expr)) return 'f0';
  if (/^sunIrradiance$/.test(expr)) return 'sunIrradiance';
  if (/^sunDirLocal\[/.test(expr)) return 'sunDirLocal';
  if (/^ambientLight$/.test(expr)) return 'ambientLight';
  if (/^oceanRoughness$/.test(expr)) return 'oceanRoughness';
  if (/^cloudShadowStrength$/.test(expr)) return 'cloudShadowStrength';
  if (/^cloudShellRadius$/.test(expr)) return 'cloudShellRadius';
  throw new Error(`writer expression maps to no known field: '${expr}'`);
}

/**
 * Parse a writer function body's `view.set{Float32,Uint32}(N, expr, ...)`
 * calls, in order. Array-element writers (`writeSurfaceTileNodeParams`,
 * `writeTileVertex`) offset by `base + N`; the singleton
 * `writeSurfaceTileUniforms` writes bare literal `N` (no array to stride
 * over) -- the `(?:base \+ )?` group covers both without two regexes.
 */
function writerLayout(source: string, fnName: string): ScalarWrite[] {
  const fnBody = source.match(
    new RegExp(`function ${fnName}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];
  if (!fnBody) throw new Error(`function ${fnName} not found in earthSurfaceTileLayout.ts`);
  const calls = fnBody.matchAll(
    /view\.set(Float32|Uint32)\(\s*(?:base \+ )?(\d+),\s*([^,]*),\s*true\s*\)/g,
  );
  const writes: ScalarWrite[] = [];
  for (const [, setter, offset, expr] of calls) {
    writes.push({
      offset: Number(offset ?? ''),
      kind: setter === 'Float32' ? 'float' : 'uint',
      field: fieldForExpr((expr ?? '').trim()),
    });
  }
  if (writes.length === 0) throw new Error(`no writer calls found in ${fnName}`);
  return writes;
}

const byOffset = (a: ScalarWrite, b: ScalarWrite): number => a.offset - b.offset;

describe('NodeParams CPU/WESL layout parity', () => {
  const ioWesl = readFileSync(ioWeslPath, 'utf8');
  const layout = readFileSync(layoutPath, 'utf8');

  it('writer offsets + kinds match the struct layout, field by field', () => {
    const { writes: expected } = structLayout(structFields(ioWesl, 'NodeParams'));
    const actual = writerLayout(layout, 'writeSurfaceTileNodeParams');
    expect([...actual].sort(byOffset)).toEqual([...expected].sort(byOffset));
  });

  it('NODE_PARAMS_BYTES stride equals the struct size', () => {
    const { structSize } = structLayout(structFields(ioWesl, 'NodeParams'));
    expect(NODE_PARAMS_BYTES).toBe(structSize);
  });
});

describe('TileVertex CPU/WESL layout parity', () => {
  const ioWesl = readFileSync(ioWeslPath, 'utf8');
  const layout = readFileSync(layoutPath, 'utf8');

  it('writer offsets + kinds match the struct layout, field by field', () => {
    const { writes: expected } = structLayout(structFields(ioWesl, 'TileVertex'));
    const actual = writerLayout(layout, 'writeTileVertex');
    expect([...actual].sort(byOffset)).toEqual([...expected].sort(byOffset));
  });

  it('TILE_VERTEX_BYTES stride equals the struct size', () => {
    const { structSize } = structLayout(structFields(ioWesl, 'TileVertex'));
    expect(TILE_VERTEX_BYTES).toBe(structSize);
  });
});

describe('SurfaceTileUniforms CPU/WESL layout parity', () => {
  const ioWesl = readFileSync(ioWeslPath, 'utf8');
  const layout = readFileSync(layoutPath, 'utf8');

  it('writer offsets + kinds match the struct layout, field by field', () => {
    const { writes: expected } = structLayout(structFields(ioWesl, 'SurfaceTileUniforms'));
    const actual = writerLayout(layout, 'writeSurfaceTileUniforms');
    expect([...actual].sort(byOffset)).toEqual([...expected].sort(byOffset));
  });

  it('SURFACE_TILE_UNIFORM_BYTES stride equals the struct size', () => {
    const { structSize } = structLayout(structFields(ioWesl, 'SurfaceTileUniforms'));
    expect(SURFACE_TILE_UNIFORM_BYTES).toBe(structSize);
  });
});
