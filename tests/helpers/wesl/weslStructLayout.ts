/**
 * Lays out `struct <structName>` from WESL source text under WGSL's alignment rules, so a parity
 * test can check a CPU packer against the struct the shader actually declares. `CameraUniforms` is
 * an opaque 80-byte block (its own parity lives in `cameraUniforms.test.ts`). Lanes, kinds and mat3
 * column handling stay with each caller, derived from `type` and `offset`.
 */
import type { WeslStructLayout } from './@types/WeslStructLayout';

const TYPES: Record<string, { align: number; size: number }> = {
  f32: { align: 4, size: 4 },
  i32: { align: 4, size: 4 },
  u32: { align: 4, size: 4 },
  'vec2<f32>': { align: 8, size: 8 },
  'vec2<u32>': { align: 8, size: 8 },
  'vec3<f32>': { align: 16, size: 12 },
  'vec4<f32>': { align: 16, size: 16 },
  // Each column pads to 16 bytes.
  'mat3x3<f32>': { align: 16, size: 48 },
  'mat4x4<f32>': { align: 16, size: 64 },
  CameraUniforms: { align: 16, size: 80 },
};

const roundUp = (value: number, align: number): number => Math.ceil(value / align) * align;

function typeLayout(type: string, field: string): { align: number; size: number } {
  const array = type.match(/^array<vec4<f32>,\s*(\d+)>$/);
  if (array) return { align: 16, size: 16 * Number(array[1]) };
  const spec = TYPES[type];
  if (!spec) throw new Error(`unhandled WESL type '${type}' on field ${field}`);
  return spec;
}

/** Split on commas outside `<…>`, so `array<vec4<f32>, 4>` stays one field. */
function topLevelFields(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '<') depth++;
    else if (c === '>') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

export function weslStructLayout(
  source: string,
  structName: string,
  addressSpace: 'uniform' | 'storage',
): WeslStructLayout {
  // Comments go first, per physical line: doc comments may hold commas or braces.
  const code = source.replace(/\/\/.*$/gm, '');
  const body = code.match(new RegExp(`struct\\s+${structName}\\s*\\{([^}]*)\\}`))?.[1];
  if (body === undefined) throw new Error(`struct ${structName} not found`);
  const fields: { name: string; type: string; offset: number; size: number }[] = [];
  let cursor = 0;
  let maxAlign = 4;
  for (const line of topLevelFields(body)) {
    const colon = line.indexOf(':');
    const name = line.slice(0, colon).trim();
    const type = line.slice(colon + 1).trim();
    if (colon < 0 || !name || !type) throw new Error(`unparsable ${structName} field: '${line}'`);
    const { align, size } = typeLayout(type, name);
    const offset = roundUp(cursor, align);
    fields.push({ name, type, offset, size });
    cursor = offset + size;
    maxAlign = Math.max(maxAlign, align);
  }
  return { fields, size: roundUp(cursor, addressSpace === 'uniform' ? 16 : maxAlign) };
}
