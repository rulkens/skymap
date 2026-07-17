/**
 * Star layout parity — the CPU packer/constants and the WESL structs must agree
 * byte-for-byte.
 *
 * The survey-star pipeline declares its two byte layouts in places a compiler
 * never cross-checks: the WESL `struct NodeParams` / `struct StarUniforms`
 * (shaders/starCatalog/io.wesl), whose field order + types the GPU uses to
 * address bytes, and the TS side in `starCatalogLayout.ts` — the ONE home both
 * the visual and pick renderers import for the pack loop
 * (`writeStarNodeParams`, with hand-literal offsets `view.setFloat32(base + 12,
 * …)`) and the uniform scalar-index constants. Reorder a field, retype one, or
 * shift an offset on either side and the shader silently reads scrambled
 * origins/scales, or the pick pass reads `pickPass` from the wrong word — a
 * class of bug the record round-trip guard (starCatalogRecord.test.ts) catches
 * for the RECORD bytes but nothing catches for the NODE / UNIFORM bytes.
 *
 * The struct's field offsets and its 16-byte-aligned size are identical under
 * WGSL std430 (storage) and std140 (uniform) — a lone vec3<f32> / a 16-byte
 * `CameraUniforms` prefix followed by scalars — so this test's std140 offset
 * math is also the true layout the storage array + uniform buffer use.
 *
 * The NodeParams half derives the canonical layout from the WESL struct (parse
 * the field order + types out of the file text, then apply the offsets) and
 * asserts the packer's actual `setFloat32/setUint32` calls — parsed from
 * `starCatalogLayout.ts` — cover exactly those offsets with the matching scalar
 * kind and feed each field from the JS expression that names it. So a rename or
 * reorder in EITHER file breaks the ordered comparison, and the stride constant
 * (imported, not restated) is pinned to the struct's computed size.
 *
 * The StarUniforms half parses `struct StarUniforms` and asserts the imported
 * float/u32 index constants land on the WESL field offsets — so appending or
 * reordering a StarUniforms field without moving the TS constants fails here.
 *
 * We read the WESL + packer files as text (rather than importing the linked
 * `?static` WGSL) because the NodeParams layout contract lives in the
 * DECLARATION order and the packer's offsets are literals inside
 * `writeStarNodeParams`, not an exported table — parsing source is the only way
 * to observe both truths without restating either.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  NODE_PARAMS_BYTES,
  STAR_UNIFORM_BYTES,
  SIZE_PX_FLOAT_INDEX,
  BRIGHTNESS_FLOAT_INDEX,
  GLOW_OVERLAP_FLOAT_INDEX,
  PICK_PASS_U32_INDEX,
} from '../../../../../src/services/gpu/renderers/starCatalog/starCatalogLayout';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const ioWeslPath = resolve(repoRoot, 'src/services/gpu/shaders/starCatalog/io.wesl');
const layoutPath = resolve(repoRoot, 'src/services/gpu/renderers/starCatalog/starCatalogLayout.ts');

/** WGSL scalar kind a field's bytes carry — the only distinction the writer makes. */
type Kind = 'float' | 'uint';

/**
 * std140 alignment + byte size for the subset the two star structs use. The
 * 80-byte `CameraUniforms` prefix (16-aligned, per shaders/lib/camera.wesl) is
 * treated as an opaque member here — the StarUniforms parity only cares about
 * the scalar offsets that follow it.
 */
const WESL_TYPES: Record<string, { align: number; size: number; kind: Kind; lanes: number }> = {
  f32: { align: 4, size: 4, kind: 'float', lanes: 1 },
  u32: { align: 4, size: 4, kind: 'uint', lanes: 1 },
  'vec3<f32>': { align: 16, size: 12, kind: 'float', lanes: 3 },
  CameraUniforms: { align: 16, size: 80, kind: 'float', lanes: 0 },
};

/** One scalar write the layout demands: a byte offset + the kind stored there + owning field. */
type ScalarWrite = { offset: number; kind: Kind; field: string };

function roundUp(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}

/** Parse `struct NAME { … }` from the WESL text into ordered `{ name, type }` fields. */
function structFields(source: string, name: string): Array<{ name: string; type: string }> {
  const body = source.match(new RegExp(`struct\\s+${name}\\s*\\{([^}]*)\\}`))?.[1];
  if (!body) throw new Error(`struct ${name} not found in io.wesl`);
  return body
    .split(',')
    .map((line) => line.replace(/\/\/.*$/gm, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [fieldName, type] = line.split(':').map((part) => part.trim());
      if (!fieldName || !type) throw new Error(`unparsable ${name} field: '${line}'`);
      return { name: fieldName, type };
    });
}

/**
 * Expand a struct to the ordered scalar writes std140 demands: a vec3<f32>
 * becomes three float writes at offset+0/+4/+8, a scalar one write, the opaque
 * `CameraUniforms` prefix zero writes (it advances the cursor 80 bytes but
 * carries no asserted scalar of its own). Returns the writes plus the struct's
 * std140 size (rounded up to its max member alignment).
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
  if (/isAggregate/.test(expr)) return 'isAggregate';
  throw new Error(`writer expression maps to no known NodeParams field: '${expr}'`);
}

/** Parse the packer's `view.set{Float32,Uint32}(base + N, expr, …)` calls, in order. */
function writerLayout(source: string): ScalarWrite[] {
  const calls = source.matchAll(
    /view\.set(Float32|Uint32)\(\s*base \+ (\d+),\s*([^,]*),\s*true\s*\)/g,
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
  if (writes.length === 0) throw new Error('no NodeParams writer calls found in starCatalogLayout');
  return writes;
}

describe('NodeParams CPU/WESL layout parity', () => {
  const ioWesl = readFileSync(ioWeslPath, 'utf8');
  const layout = readFileSync(layoutPath, 'utf8');

  it('writer offsets + kinds match the std140 struct layout, field by field', () => {
    const { writes: expected } = structLayout(structFields(ioWesl, 'NodeParams'));
    const actual = writerLayout(layout);
    // Compare ordered by offset so a reorder on either side (which moves a
    // field's offset) surfaces as a per-element diff, not a set equality pass.
    const byOffset = (a: ScalarWrite, b: ScalarWrite) => a.offset - b.offset;
    expect([...actual].sort(byOffset)).toEqual([...expected].sort(byOffset));
  });

  it('NODE_PARAMS_BYTES stride equals the struct std140 size', () => {
    const { structSize } = structLayout(structFields(ioWesl, 'NodeParams'));
    expect(NODE_PARAMS_BYTES).toBe(structSize);
  });
});

describe('StarUniforms CPU/WESL layout parity', () => {
  const ioWesl = readFileSync(ioWeslPath, 'utf8');

  it('the TS scalar-index constants land on the WESL field offsets', () => {
    const { writes, structSize } = structLayout(structFields(ioWesl, 'StarUniforms'));
    // Map each appended scalar field to its byte offset (the CameraUniforms
    // prefix contributes no scalar write, so `writes` starts at `sizePx`).
    const offsetOf = (field: string): number => {
      const w = writes.find((x) => x.field === field);
      if (!w) throw new Error(`StarUniforms.${field} not found in io.wesl`);
      return w.offset;
    };
    // TS stores these as f32/u32 INDICES (byte offset / 4).
    expect(SIZE_PX_FLOAT_INDEX).toBe(offsetOf('sizePx') / 4);
    expect(BRIGHTNESS_FLOAT_INDEX).toBe(offsetOf('brightness') / 4);
    expect(GLOW_OVERLAP_FLOAT_INDEX).toBe(offsetOf('glowOverlap') / 4);
    expect(PICK_PASS_U32_INDEX).toBe(offsetOf('pickPass') / 4);
    // pickPass is a u32 in WESL; the TS renderer writes it via a Uint32 view at
    // the same word — pin the kind so a WESL f32/u32 retype surfaces here.
    expect(writes.find((x) => x.field === 'pickPass')?.kind).toBe('uint');
    expect(STAR_UNIFORM_BYTES).toBe(structSize);
  });
});
