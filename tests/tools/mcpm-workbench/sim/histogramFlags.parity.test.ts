/**
 * TS↔WESL parity for the T20 histogram pass's three mirrored numbers:
 * - `HISTOGRAM_FLAGS_BYTES` (createGridBuffers.ts) ↔ histogram.wesl's
 *   `HistogramFlags` struct (its own tiny group(2) uniform).
 * - `HISTOGRAM_BINS` (createGridBuffers.ts) ↔ constants.wesl's
 *   `N_HISTOGRAM_BINS` — sizes the `histogram` buffer.
 * - `HISTOGRAM_BASE` (createGridBuffers.ts) ↔ constants.wesl's
 *   `HISTOGRAM_BASE` — must agree or the UI's "(log <base>)" readout lies
 *   about which log the shader actually took.
 * `?static` WESL linking has no value injection, so these mirrors only stay
 * honest under a test — same idiom as `tests/data/selectionEncoding.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  HISTOGRAM_BASE,
  HISTOGRAM_BINS,
  HISTOGRAM_FLAGS_BYTES,
} from '../../../../tools/mcpm-workbench/src/sim/createGridBuffers';

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

/** Same idiom as `flow/constants.wesl parity.test.ts`'s `parseWeslConstants`. */
function readWeslConst(text: string, name: string): number | undefined {
  const re = /const\s+(\w+)\s*:\s*(?:u32|f32)\s*=\s*([0-9]+(?:\.[0-9]+)?)[uf]?\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1] === name) return parseFloat(m[2]!);
  }
  return undefined;
}

describe('HistogramFlags struct size parity (histogram.wesl ↔ createGridBuffers.ts)', () => {
  it('HistogramFlags struct size equals HISTOGRAM_FLAGS_BYTES', () => {
    const text = readFileSync(
      join(process.cwd(), 'src/services/gpu/shaders/mcpm/histogram.wesl'),
      'utf-8',
    );
    const fields = parseWeslStructFields(text, 'HistogramFlags');
    // Every declared field here is a 4-byte scalar (i32/u32/f32) — HistogramFlags
    // is a single i32 today; this generalizes if a second flag is ever added.
    expect(fields.length * 4).toBe(HISTOGRAM_FLAGS_BYTES);
  });
});

describe('N_HISTOGRAM_BINS / HISTOGRAM_BASE parity (constants.wesl ↔ createGridBuffers.ts)', () => {
  const text = readFileSync(
    join(process.cwd(), 'src/services/gpu/shaders/mcpm/constants.wesl'),
    'utf-8',
  );

  it('N_HISTOGRAM_BINS matches HISTOGRAM_BINS', () => {
    const weslValue = readWeslConst(text, 'N_HISTOGRAM_BINS');
    expect(weslValue, 'N_HISTOGRAM_BINS is missing from constants.wesl').toBeDefined();
    expect(weslValue).toBe(HISTOGRAM_BINS);
  });

  it('HISTOGRAM_BASE matches HISTOGRAM_BASE', () => {
    const weslValue = readWeslConst(text, 'HISTOGRAM_BASE');
    expect(weslValue, 'HISTOGRAM_BASE is missing from constants.wesl').toBeDefined();
    expect(weslValue).toBe(HISTOGRAM_BASE);
  });
});
