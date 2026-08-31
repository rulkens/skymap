/**
 * TS↔WESL parity: io.wesl's `McpmUniforms` struct vs. `UNIFORM_BYTES`
 * (createGridBuffers.ts, the buffer's allocated size) and encodeStep.ts's
 * field-by-index `Float32Array`/`Int32Array` write (the layout that write
 * actually encodes — see its inline comments for the field each index
 * represents). `?static` WESL linking is pure text substitution with no value
 * injection, so nothing but a test catches a struct field added, removed, or
 * reordered on the WESL side without a matching TS change — same rationale
 * and idiom as `tests/data/selectionEncoding.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { UNIFORM_BYTES } from '../../../../tools/mcpm-workbench/src/sim/createGridBuffers';

const WGSL_SCALAR_BYTES: Record<string, number> = { f32: 4, i32: 4, u32: 4 };

/** Parses a WESL `struct NAME { field: type, ... };` body into its ordered field list. */
function parseWeslStructFields(text: string, structName: string): Array<[string, string]> {
  const structRe = new RegExp(`struct\\s+${structName}\\s*{([^}]*)}`, 's');
  const body = structRe.exec(text)?.[1];
  if (body === undefined) throw new Error(`struct ${structName} not found`);
  const fieldRe = /(\w+)\s*:\s*([\w<>]+)\s*,/g;
  const fields: Array<[string, string]> = [];
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(body)) !== null) fields.push([m[1]!, m[2]!]);
  return fields;
}

describe('McpmUniforms TS↔WESL parity (io.wesl ↔ createGridBuffers.ts + encodeStep.ts)', () => {
  const text = readFileSync(join(process.cwd(), 'src/services/gpu/shaders/mcpm/io.wesl'), 'utf-8');
  const fields = parseWeslStructFields(text, 'McpmUniforms');

  it('every field is a 4-byte scalar (no vec3 — the size-per-field assumption below)', () => {
    for (const [name, type] of fields) {
      expect(WGSL_SCALAR_BYTES[type], `McpmUniforms.${name} has unhandled type ${type}`).toBe(4);
    }
  });

  it('total struct size equals UNIFORM_BYTES', () => {
    expect(fields.length * 4).toBe(UNIFORM_BYTES);
  });

  it('field order matches encodeStep.ts’s index-by-index write (its inline comments name each field)', () => {
    // Mirrors encodeStep.ts: f32[0..6]/i32[7..15] in this exact order — see its
    // `f32[N] = params.X` / `i32[N] = ...` lines.
    const expected = [
      'senseSpread',
      'senseDistance',
      'turnAngle',
      'moveDistance',
      'depositValue',
      'decayFactor',
      'centerAttraction',
      'worldWidth',
      'worldHeight',
      'worldDepth',
      'sharpness',
      'normalizationFactor',
      'nDataPoints',
      'nAgents',
      'nIteration',
      '_pad0',
    ];
    expect(fields.map(([name]) => name)).toEqual(expected);
  });
});
