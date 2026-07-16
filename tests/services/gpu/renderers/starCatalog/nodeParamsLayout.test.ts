/**
 * NodeParams layout parity — the CPU writer and the WESL struct must agree
 * byte-for-byte.
 *
 * The per-drawn-node uniform is declared in TWO places that a compiler never
 * cross-checks: the WESL `struct NodeParams` (shaders/starCatalog/io.wesl),
 * whose field order + types the GPU uses to address bytes under std140 uniform
 * rules, and the CPU packer in starCatalogRenderer.ts, which writes those same
 * bytes with hand-literal offsets (`setFloat32(base + 12, …)`) plus the
 * `NODE_PARAMS_BYTES` stride constant. Reorder a field, retype one, or shift an
 * offset on either side and the shader silently reads scrambled origins/scales
 * — a class of bug the record round-trip guard (starCatalogRecord.test.ts)
 * catches for the RECORD bytes but nothing catches for the NODE bytes.
 *
 * This test derives the canonical layout from the WESL struct (parse the field
 * order + types out of the file text, then apply std140 offsets) and asserts
 * the writer's actual `setFloat32/setUint32` calls — parsed from the renderer
 * source — cover exactly those offsets with the matching scalar kind and feed
 * each field from the JS expression that names it. So a rename or reorder in
 * EITHER file breaks the ordered comparison, and the stride constant is pinned
 * to the struct's computed size.
 *
 * We read the two files as text (rather than importing the linked `?static`
 * WGSL) because the layout contract lives in the DECLARATION order, and the
 * writer's offsets are literals inside `draw`, not an exported table — parsing
 * source is the only way to observe both truths without restating either.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const ioWeslPath = resolve(repoRoot, 'src/services/gpu/shaders/starCatalog/io.wesl');
const rendererPath = resolve(
  repoRoot,
  'src/services/gpu/renderers/starCatalog/starCatalogRenderer.ts',
);

/** WGSL scalar kind a field's bytes carry — the only distinction the writer makes. */
type Kind = 'float' | 'uint';

/** std140 alignment + byte size for the scalar/vec3 subset NodeParams uses. */
const WESL_TYPES: Record<string, { align: number; size: number; kind: Kind; lanes: number }> = {
  'f32': { align: 4, size: 4, kind: 'float', lanes: 1 },
  'u32': { align: 4, size: 4, kind: 'uint', lanes: 1 },
  'vec3<f32>': { align: 16, size: 12, kind: 'float', lanes: 3 },
};

/** One scalar write the layout demands: a byte offset + the kind stored there + owning field. */
type ScalarWrite = { offset: number; kind: Kind; field: string };

function roundUp(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}

/**
 * Parse `struct NodeParams { … }` from the WESL text and expand it to the
 * ordered scalar writes std140 demands: a vec3<f32> becomes three float writes
 * at offset+0/+4/+8, a scalar one write. Returns the writes plus the struct's
 * std140 size (rounded up to its 16-byte member alignment).
 */
function weslLayout(source: string): { writes: ScalarWrite[]; structSize: number } {
  const body = source.match(/struct\s+NodeParams\s*\{([^}]*)\}/)?.[1];
  if (!body) throw new Error('struct NodeParams not found in io.wesl');

  const fields = body
    .split(',')
    .map((line) => line.replace(/\/\/.*$/gm, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name, type] = line.split(':').map((part) => part.trim());
      if (!name || !type) throw new Error(`unparsable NodeParams field: '${line}'`);
      return { name, type };
    });

  const writes: ScalarWrite[] = [];
  let cursor = 0;
  let maxAlign = 4;
  for (const { name, type } of fields) {
    const spec = WESL_TYPES[type];
    if (!spec) throw new Error(`unhandled WESL type '${type}' on NodeParams.${name}`);
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
 * Which NodeParams field a writer expression feeds. This is the sole piece of
 * cross-language glue — the binding between a JS value and the struct member it
 * targets. Renaming a struct field forces this map to move too, which is
 * exactly the deliberate-update the parity guard demands.
 */
function fieldForExpr(expr: string): string {
  if (/\bo\[[012]\]/.test(expr)) return 'originRelCamMpc';
  if (/cellScaleMpc/.test(expr)) return 'cellScaleMpc';
  if (/firstRecord/.test(expr)) return 'firstRecord';
  if (/opacity/.test(expr)) return 'opacity';
  if (/subtreeStarCount/.test(expr)) return 'subtreeStarCount';
  if (/level/.test(expr)) return 'level';
  throw new Error(`writer expression maps to no known NodeParams field: '${expr}'`);
}

/** Parse the renderer's per-node `setFloat32/setUint32(base + N, expr, …)` calls, in order. */
function writerLayout(source: string): ScalarWrite[] {
  const calls = source.matchAll(
    /nodeScratchView\.set(Float32|Uint32)\(\s*base \+ (\d+),\s*([^,]*),\s*true\s*\)/g,
  );
  const writes: ScalarWrite[] = [];
  for (const [, setter, offset, expr] of calls) {
    // The three groups are non-optional in the pattern, so a match always fills
    // them; the `?? ''` only satisfies the string|undefined match-group type.
    writes.push({
      offset: Number(offset ?? ''),
      kind: setter === 'Float32' ? 'float' : 'uint',
      field: fieldForExpr(expr ?? ''),
    });
  }
  if (writes.length === 0) throw new Error('no NodeParams writer calls found in the renderer');
  return writes;
}

describe('NodeParams CPU/WESL layout parity', () => {
  const ioWesl = readFileSync(ioWeslPath, 'utf8');
  const renderer = readFileSync(rendererPath, 'utf8');

  it('writer offsets + kinds match the std140 struct layout, field by field', () => {
    const { writes: expected } = weslLayout(ioWesl);
    const actual = writerLayout(renderer);
    // Compare ordered by offset so a reorder on either side (which moves a
    // field's offset) surfaces as a per-element diff, not a set equality pass.
    const byOffset = (a: ScalarWrite, b: ScalarWrite) => a.offset - b.offset;
    expect([...actual].sort(byOffset)).toEqual([...expected].sort(byOffset));
  });

  it('NODE_PARAMS_BYTES stride equals the struct std140 size', () => {
    const { structSize } = weslLayout(ioWesl);
    const declared = renderer.match(/const NODE_PARAMS_BYTES = (\d+);/)?.[1];
    expect(declared).toBeDefined();
    expect(Number(declared)).toBe(structSize);
  });
});
