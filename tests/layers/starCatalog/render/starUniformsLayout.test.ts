/**
 * The CPU index constants and `struct StarUniforms` (shaders/starCatalog/io.wesl)
 * must agree byte for byte: a shifted focus field silently feeds the shader a
 * scrambled sphere. Offsets are derived from the struct text under WGSL uniform
 * alignment, so a field added on either side without the other fails here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STAR_UNIFORM_BYTES,
  SIZE_PX_FLOAT_INDEX,
  BRIGHTNESS_FLOAT_INDEX,
  GLOW_OVERLAP_FLOAT_INDEX,
  PICK_PASS_U32_INDEX,
  AGG_INTENSITY_CAP_FLOAT_INDEX,
  PX_PER_RAD_FLOAT_INDEX,
  FOCUS_CENTER_FLOAT_INDEX,
  FOCUS_APPARENT_FLOAT_INDEX,
  FOCUS_PHYSICAL_FLOAT_INDEX,
  FOCUS_BLEND_FLOAT_INDEX,
} from '../../../../src/layers/starCatalog/render/starCatalogLayout';

const WORD = 4;
const TYPES: Record<string, { align: number; size: number }> = {
  f32: { align: 4, size: 4 },
  u32: { align: 4, size: 4 },
  'vec3<f32>': { align: 16, size: 12 },
  CameraUniforms: { align: 16, size: 80 },
};

const roundUp = (v: number, a: number) => Math.ceil(v / a) * a;

function layoutOf(struct: string): { offsets: Map<string, number>; size: number } {
  const source = readFileSync(
    join(process.cwd(), 'src/services/gpu/shaders/starCatalog/io.wesl'),
    'utf8',
  );
  const body = new RegExp(`struct\\s+${struct}\\s*\\{([^}]*)\\}`).exec(source)?.[1];
  if (!body) throw new Error(`struct ${struct} not found`);
  const offsets = new Map<string, number>();
  let cursor = 0;
  let maxAlign = 4;
  for (const line of body.replace(/\/\/.*$/gm, '').split(',')) {
    const [name, type] = line.split(':').map((s) => s.trim());
    if (!name || !type) continue;
    const spec = TYPES[type];
    if (!spec) throw new Error(`unhandled type ${type}`);
    const at = roundUp(cursor, spec.align);
    offsets.set(name, at);
    cursor = at + spec.size;
    maxAlign = Math.max(maxAlign, spec.align);
  }
  return { offsets, size: roundUp(cursor, maxAlign) };
}

describe('StarUniforms CPU/WESL layout parity', () => {
  const { offsets, size } = layoutOf('StarUniforms');
  const at = (field: string) => offsets.get(field)! / WORD;

  it('every TS index lands on its WESL field', () => {
    expect(SIZE_PX_FLOAT_INDEX).toBe(at('sizePx'));
    expect(BRIGHTNESS_FLOAT_INDEX).toBe(at('brightness'));
    expect(GLOW_OVERLAP_FLOAT_INDEX).toBe(at('glowOverlap'));
    expect(PICK_PASS_U32_INDEX).toBe(at('pickPass'));
    expect(AGG_INTENSITY_CAP_FLOAT_INDEX).toBe(at('aggregateIntensityCap'));
    expect(PX_PER_RAD_FLOAT_INDEX).toBe(at('pxPerRad'));
    expect(FOCUS_CENTER_FLOAT_INDEX).toBe(at('focusCenterRelCam'));
    expect(FOCUS_APPARENT_FLOAT_INDEX).toBe(at('focusApparentRadiusMpc'));
    expect(FOCUS_PHYSICAL_FLOAT_INDEX).toBe(at('focusPhysicalRadiusMpc'));
    expect(FOCUS_BLEND_FLOAT_INDEX).toBe(at('focusBlend'));
  });

  it('the buffer size is the struct size', () => {
    expect(STAR_UNIFORM_BYTES).toBe(size);
  });
});
