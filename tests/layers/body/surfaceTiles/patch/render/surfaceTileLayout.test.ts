/**
 * surfaceTile layout parity: the CPU packer and the WESL structs (`PatchInstance`,
 * `SurfaceTileUniforms` in `shaders/bodies/surfaceTile/io.wesl`) must agree byte-for-byte.
 * `writePatchInstance` / `writeSurfaceTileUniforms` in `surfaceTileLayout.ts` restate the offsets as
 * hand-literal `view.set{Float32,Uint32}(N, expr, true)` calls (the array-element writer adds a
 * `base +`, the singleton uniform writer doesn't); only this test cross-checks them. A WGSL reorder
 * without a TS move scrambles every patch silently, and WebKit rejects a mislaid layout Tint
 * tolerates: iOS presents nothing, no error. Both files are read as TEXT because the layout lives in
 * declaration order and in literals inside the writers, not an exported table.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  PATCH_INSTANCE_BYTES,
  SURFACE_TILE_UNIFORM_BYTES,
  writePatchInstance,
} from '../../../../../../src/layers/body/surfaceTiles/patch/render/surfaceTileLayout';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../../..');
const ioWeslPath = resolve(repoRoot, 'src/services/gpu/shaders/bodies/surfaceTile/io.wesl');
const layoutPath = resolve(
  repoRoot,
  'src/layers/body/surfaceTiles/patch/render/surfaceTileLayout.ts',
);

/** WGSL scalar kind a field's bytes carry -- the only distinction the writer makes. */
type Kind = 'float' | 'uint';

/** std140/std430 alignment + byte size for the subset these three structs use. */
const WESL_TYPES: Record<string, { align: number; size: number; kind: Kind; lanes: number }> = {
  f32: { align: 4, size: 4, kind: 'float', lanes: 1 },
  u32: { align: 4, size: 4, kind: 'uint', lanes: 1 },
  'vec2<f32>': { align: 8, size: 8, kind: 'float', lanes: 2 },
  'vec2<u32>': { align: 8, size: 8, kind: 'uint', lanes: 2 },
  'vec3<f32>': { align: 16, size: 12, kind: 'float', lanes: 3 },
  'vec4<f32>': { align: 16, size: 16, kind: 'float', lanes: 4 },
  'mat4x4<f32>': { align: 16, size: 64, kind: 'float', lanes: 16 },
};

/** One scalar write the layout demands: a byte offset + the kind stored there + owning field. */
type ScalarWrite = { offset: number; kind: Kind; field: string };

function roundUp(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}

/**
 * Parse `struct NAME { ... }` from the WESL text into ordered `{ name, type }` fields. io.wesl's
 * fields carry multi-line doc comments, so comments are stripped PER PHYSICAL LINE before splitting
 * each `name: type,` line on its colon.
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
 * Expand a struct to the ordered scalar writes std430 demands (a vecN is N float writes at
 * offset+0/+4/...), plus the struct's size rounded up to its max member alignment.
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
  if (/^originRelEyeM\[[012]\]$/.test(expr)) return 'originRelEyeM';
  if (/^fadeWeight$/.test(expr)) return 'fadeWeight';
  if (/^anchor\.lon0Rad$/.test(expr)) return 'lon0Rad';
  if (/^anchor\.lat0Rad$/.test(expr)) return 'lat0Rad';
  if (/^anchor\.dLonRad$/.test(expr)) return 'dLonRad';
  if (/^anchor\.dLatRad$/.test(expr)) return 'dLatRad';
  if (/^albedoRect\[[0-3]\]$/.test(expr)) return 'albedoRect';
  if (/^fallbackRect\[[0-3]\]$/.test(expr)) return 'fallbackRect';
  if (/^nightRect\[[0-3]\]$/.test(expr)) return 'nightRect';
  if (/^heightSlotOrigin\[[01]\]/.test(expr)) return 'heightSlotOrigin';
  if (/^edgeCoarser\b/.test(expr)) return 'edgeCoarser';
  if (/^heightCells\b/.test(expr)) return 'heightCells';
  if (/^vp\[/.test(expr)) return 'vp';
  const orientationIndex = expr.match(/^orientation\[(\d+)\]/);
  if (orientationIndex) {
    const idx = Number(orientationIndex[1]);
    return idx < 3 ? 'rotCol0' : idx < 6 ? 'rotCol1' : 'rotCol2';
  }
  if (/^radiusM$/.test(expr)) return 'radiusM';
  if (/^meshResolution\b/.test(expr)) return 'meshResolution';
  if (/^roughnessBase$/.test(expr)) return 'roughnessBase';
  if (/^camPosRelBodyM\[/.test(expr)) return 'camPosRelBodyM';
  if (/^f0$/.test(expr)) return 'f0';
  if (/^sunIrradiance$/.test(expr)) return 'sunIrradiance';
  if (/^sunDirLocal\[/.test(expr)) return 'sunDirLocal';
  if (/^ambientLight$/.test(expr)) return 'ambientLight';
  if (/^oceanRoughness$/.test(expr)) return 'oceanRoughness';
  if (/^cloudShadowStrength$/.test(expr)) return 'cloudShadowStrength';
  if (/^cloudShellRadius$/.test(expr)) return 'cloudShellRadius';
  if (/^debugLodOverlay/.test(expr)) return 'debugLodOverlay';
  if (/^noDisplacement/.test(expr)) return 'noDisplacement';
  if (/^noSkirts/.test(expr)) return 'noSkirts';
  throw new Error(`writer expression maps to no known field: '${expr}'`);
}

/**
 * Parse a writer function body's `view.set{Float32,Uint32}(N, expr, ...)`
 * calls, in order. The array-element writer (`writePatchInstance`) offsets
 * by `base + N`; the singleton `writeSurfaceTileUniforms` writes bare
 * literal `N` (no array to stride over) -- the `(?:base \+ )?` group covers
 * both without two regexes.
 */
function writerLayout(source: string, fnName: string): ScalarWrite[] {
  const fnBody = source.match(
    new RegExp(`function ${fnName}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];
  if (!fnBody) throw new Error(`function ${fnName} not found in surfaceTileLayout.ts`);
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

describe('PatchInstance CPU/WESL layout parity', () => {
  const ioWesl = readFileSync(ioWeslPath, 'utf8');
  const layout = readFileSync(layoutPath, 'utf8');

  it('writer offsets + kinds match the struct layout, field by field', () => {
    const { writes: expected } = structLayout(structFields(ioWesl, 'PatchInstance'));
    const actual = writerLayout(layout, 'writePatchInstance');
    expect([...actual].sort(byOffset)).toEqual([...expected].sort(byOffset));
  });

  it('PATCH_INSTANCE_BYTES stride equals the struct size', () => {
    const { structSize } = structLayout(structFields(ioWesl, 'PatchInstance'));
    expect(PATCH_INSTANCE_BYTES).toBe(structSize);
  });

  // Pinned as absolute numbers, not derived: a vec2<u32> declared BEFORE the
  // vec4s still parses and still packs, but pads the record past 96 bytes
  // (spec §7's field-order note), and the derived check above would follow it.
  it('every field lands at its pinned offset inside a 96-byte record', () => {
    const { writes, structSize } = structLayout(structFields(ioWesl, 'PatchInstance'));
    expect(PATCH_INSTANCE_BYTES).toBe(96);
    expect(structSize).toBe(96);
    const firstOffset = (field: string) =>
      Math.min(...writes.filter((w) => w.field === field).map((w) => w.offset));
    expect(firstOffset('originRelEyeM')).toBe(0);
    expect(firstOffset('fadeWeight')).toBe(12);
    expect(firstOffset('lon0Rad')).toBe(16);
    expect(firstOffset('albedoRect')).toBe(32);
    expect(firstOffset('fallbackRect')).toBe(48);
    expect(firstOffset('nightRect')).toBe(64);
    expect(firstOffset('heightSlotOrigin')).toBe(80);
    expect(firstOffset('edgeCoarser')).toBe(88);
    expect(firstOffset('heightCells')).toBe(92);
  });

  // fieldForExpr maps every lane of a multi-lane field to one field name, so
  // the offset/kind/field check above can't see an origin<->scale swap inside
  // a rect, or an x<->y swap in heightSlotOrigin (which would read a whole
  // other tile's posts) -- asymmetric fixture values per lane close that gap.
  it('multi-lane fields land lane by lane, in declaration order', () => {
    const view = new DataView(new ArrayBuffer(PATCH_INSTANCE_BYTES));
    writePatchInstance(view, 0, {
      originRelEyeM: [0, 0, 0],
      fadeWeight: 1,
      anchor: { lon0Rad: 0, lat0Rad: 0, dLonRad: 0, dLatRad: 0 },
      albedoRect: [0.11, 0.22, 0.33, 0.44],
      fallbackRect: [0.55, 0.66, 0.77, 0.88],
      nightRect: [0.12, 0.34, 0.56, 0.78],
      heightSlotOrigin: [129, 258],
      edgeCoarser: 0b1011,
      heightCells: 32,
    });
    expect(view.getFloat32(32, true)).toBeCloseTo(0.11); // albedoUvOriginX
    expect(view.getFloat32(36, true)).toBeCloseTo(0.22); // albedoUvOriginY
    expect(view.getFloat32(40, true)).toBeCloseTo(0.33); // albedoUvScaleX
    expect(view.getFloat32(44, true)).toBeCloseTo(0.44); // albedoUvScaleY
    expect(view.getFloat32(48, true)).toBeCloseTo(0.55); // fallbackUvOriginX
    expect(view.getFloat32(52, true)).toBeCloseTo(0.66); // fallbackUvOriginY
    expect(view.getFloat32(56, true)).toBeCloseTo(0.77); // fallbackUvScaleX
    expect(view.getFloat32(60, true)).toBeCloseTo(0.88); // fallbackUvScaleY
    expect(view.getFloat32(64, true)).toBeCloseTo(0.12); // nightUvOriginX
    expect(view.getFloat32(68, true)).toBeCloseTo(0.34); // nightUvOriginY
    expect(view.getFloat32(72, true)).toBeCloseTo(0.56); // nightUvScaleX
    expect(view.getFloat32(76, true)).toBeCloseTo(0.78); // nightUvScaleY
    expect(view.getUint32(80, true)).toBe(129); // heightSlotOriginX
    expect(view.getUint32(84, true)).toBe(258); // heightSlotOriginY
    expect(view.getUint32(88, true)).toBe(0b1011); // edgeCoarser
    expect(view.getUint32(92, true)).toBe(32); // heightCells
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
