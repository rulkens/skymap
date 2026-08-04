/**
 * Parity guard: SEGMENTS in `orbitTrail/constants.wesl` must equal the
 * authoritative TS export RIBBON_SEGMENTS in
 * `src/data/bodies/orbitTrailConstants.ts`. `?static` WESL linking is pure
 * build-time text linking with NO value injection, so a mismatch is invisible
 * to the compiler — it silently produces a partly-drawn or garbage-cornered
 * ribbon on hardware, because the CPU-side draw call issues
 * `RIBBON_SEGMENTS * 6` vertices while the shader loops to a different
 * SEGMENTS. Mirrors `tests/services/gpu/shaders/constants.parity.test.ts`
 * (same regex, same `process.cwd()` path resolution).
 *
 * STROKE_PX and MARGIN_PX also live in constants.wesl but have no TS
 * consumer, so they are intentionally left out of the "no orphans" check
 * below — they are known shader-only constants, not missed twins.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RIBBON_SEGMENTS } from '../../../../src/data/bodies/orbitTrailConstants';
import {
  INSTANCE_ATTRIBUTES,
  INSTANCE_FLOATS,
  INSTANCE_STRIDE,
} from '../../../../src/services/gpu/renderers/bodies/orbitTrailRenderer';

/**
 * Extract every `const NAME: (u32|f32) = <number>;` from
 * orbitTrail/constants.wesl. Handles the `u`/`f` literal suffixes and float
 * syntax, parsing with `parseFloat` so `96u` -> 96 and `2.5` -> 2.5 alike.
 */
function parseWeslConstants(): Map<string, number> {
  const path = join(
    process.cwd(),
    'src/services/gpu/shaders/bodies/orbitTrail/constants.wesl',
  );
  const text = readFileSync(path, 'utf-8');
  const re = /const\s+(\w+)\s*:\s*(?:u32|f32)\s*=\s*([0-9]+(?:\.[0-9]+)?)[uf]?\s*;/g;
  const map = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    map.set(m[1]!, parseFloat(m[2]!));
  }
  return map;
}

describe('orbitTrail/constants.wesl ↔ orbitTrailConstants.ts parity', () => {
  it('SEGMENTS in orbitTrail/constants.wesl equals RIBBON_SEGMENTS', () => {
    const wesl = parseWeslConstants();
    const weslValue = wesl.get('SEGMENTS');
    expect(weslValue, 'WESL constant SEGMENTS is missing from orbitTrail/constants.wesl').toBeDefined();
    expect(
      weslValue,
      `WESL SEGMENTS (${weslValue}) does not match TS RIBBON_SEGMENTS (${RIBBON_SEGMENTS})`,
    ).toBe(RIBBON_SEGMENTS);
  });
});

/** One `OrbitInstance` field: its `@location`, name, and WESL-type float count. */
type WeslField = { location: number; name: string; floats: number };

/**
 * Extract every `@location(N) name: <type>,` field from io.wesl's
 * `OrbitInstance` struct body. Types are `vecK<f32>` or bare `f32` — the only
 * shapes the record uses — mapped to their float count.
 */
function parseOrbitInstanceFields(): WeslField[] {
  const path = join(
    process.cwd(),
    'src/services/gpu/shaders/bodies/orbitTrail/io.wesl',
  );
  const text = readFileSync(path, 'utf-8');
  const structMatch = text.match(/struct OrbitInstance \{([\s\S]*?)\n\};/);
  if (!structMatch) throw new Error('OrbitInstance struct not found in io.wesl');
  const body = structMatch[1]!;
  const re = /@location\((\d+)\)\s+(\w+)\s*:\s*(vec([234])<f32>|f32)\s*,/g;
  const fields: WeslField[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const floats = m[4] ? parseInt(m[4], 10) : 1;
    fields.push({ location: parseInt(m[1]!, 10), name: m[2]!, floats });
  }
  return fields;
}

/** `float32x4` -> 4, `float32x2` -> 2, `float32` -> 1. */
function floatsOfFormat(format: GPUVertexFormat): number {
  const m = /^float32x?([234])?$/.exec(format);
  if (!m) throw new Error(`Unrecognised vertex format in parity test: ${format}`);
  return m[1] ? parseInt(m[1], 10) : 1;
}

describe('orbitTrail/io.wesl OrbitInstance ↔ orbitTrailRenderer INSTANCE_ATTRIBUTES parity', () => {
  // This is the F1 drift the radar caught live: the record grew 28 -> 40 ->
  // 32 -> 34 floats over the branch, and one hand-maintained site (the public
  // .d.ts) was already stale. Regexing both sides and comparing catches a
  // missing/renamed field or a changed format at test time instead of on
  // hardware, where a drifted offset just reads garbage.
  const fields = parseOrbitInstanceFields();
  const attrs = INSTANCE_ATTRIBUTES;

  it('every WESL @location has a matching INSTANCE_ATTRIBUTES entry, and vice versa', () => {
    const weslLocations = fields.map((f) => f.location).sort((a, b) => a - b);
    const tsLocations = attrs.map((a) => a.shaderLocation).sort((a, b) => a - b);
    expect(weslLocations).toEqual(tsLocations);
  });

  it('each field\'s WESL type implies the same float count as its attribute format', () => {
    for (const field of fields) {
      const attr = attrs.find((a) => a.shaderLocation === field.location);
      expect(attr, `no INSTANCE_ATTRIBUTES entry for @location(${field.location})`).toBeDefined();
      expect(
        floatsOfFormat(attr!.format),
        `@location(${field.location}) '${field.name}' is ${field.floats} floats in WESL but attribute format is '${attr!.format}'`,
      ).toBe(field.floats);
    }
  });

  it('the field floats sum to INSTANCE_FLOATS, and INSTANCE_STRIDE is INSTANCE_FLOATS * 4', () => {
    const total = fields.reduce((sum, f) => sum + f.floats, 0);
    expect(total).toBe(INSTANCE_FLOATS);
    expect(INSTANCE_STRIDE).toBe(INSTANCE_FLOATS * 4);
  });

  // Locations and float-widths alone let two fields trade @location numbers
  // without moving anything else — sets, counts and sums are all unchanged,
  // yet the vertex stage now reads e.g. Ac where it meant Cc. This is the ONE
  // place the record's field ORDER is asserted; it is deliberately a literal,
  // not derived from either side, so it can't agree with a swap on both ends.
  it('WESL field names map to the expected @location order', () => {
    const expectedOrder = [
      { location: 1, name: 'ginv0' },
      { location: 2, name: 'ginv1' },
      { location: 3, name: 'ginv2' },
      { location: 4, name: 'params' },
      { location: 5, name: 'phase' },
      { location: 6, name: 'cc' },
      { location: 7, name: 'ac' },
      { location: 8, name: 'bc' },
      { location: 9, name: 'arc' },
    ];
    const actualOrder = fields
      .map((f) => ({ location: f.location, name: f.name }))
      .sort((a, b) => a.location - b.location);
    expect(actualOrder).toEqual(expectedOrder);
  });

  // A location swap that also swaps byte offsets in lockstep would slip past
  // the name↔location check above; this ties offset to location independent
  // of name, catching a reordered OR mis-offset attribute either side.
  it('each attribute offset equals 4 × the total floats of all lower-numbered locations', () => {
    const sorted = [...fields].sort((a, b) => a.location - b.location);
    let runningFloats = 0;
    for (const field of sorted) {
      const attr = attrs.find((a) => a.shaderLocation === field.location);
      expect(attr, `no INSTANCE_ATTRIBUTES entry for @location(${field.location})`).toBeDefined();
      expect(
        attr!.offset,
        `@location(${field.location}) '${field.name}' expected byte offset ${runningFloats * 4}, got ${attr!.offset}`,
      ).toBe(runningFloats * 4);
      runningFloats += field.floats;
    }
  });
});
