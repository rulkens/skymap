/**
 * TS↔WESL parity for io.wesl's @group(1) binding-slot contract and
 * constants.wesl's decay workgroup edge:
 * - `PROPAGATE_SLOTS` / `DECAY_SLOTS` / `HISTOGRAM_STORAGE_SLOTS`
 *   (createMcpmHarness.ts) mirror io.wesl's `@group(1) @binding(N)` numbers —
 *   a binding-slot mismatch fails LOUD (WebGPU validation rejects the bind
 *   group), but only if the exact mirror it's checked against is itself
 *   correct; this test derives the expected slots from the WESL source
 *   rather than restating the numbers, so a renumbered binding is caught here
 *   pre-GPU too.
 * - `DECAY_WG_EDGE` (encodeStep.ts) mirrors constants.wesl's three
 *   `DECAY_WG_*` overrides — the decay dispatch divides each grid dimension
 *   by this, so a mismatch silently mis-shapes the dispatch (a reshape is
 *   only bitwise-identical when the divisor matches the kernel's own
 *   `@workgroup_size`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DECAY_SLOTS,
  HISTOGRAM_STORAGE_SLOTS,
  PROPAGATE_SLOTS,
} from '../../../../tools/mcpm-workbench/src/sim/createMcpmHarness';
import { DECAY_WG_EDGE } from '../../../../tools/mcpm-workbench/src/sim/encodeStep';

/** Parses every `@group(1) @binding(N) var<...> NAME: ...;` line into a name -> slot map. */
function parseGroup1Bindings(text: string): Map<string, number> {
  const re = /@group\(1\)\s*@binding\((\d+)\)\s*var<[^>]+>\s*(\w+)\s*:/g;
  const map = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) map.set(m[2]!, parseInt(m[1]!, 10));
  return map;
}

describe('dispatch bind-group slot parity (io.wesl ↔ createMcpmHarness.ts)', () => {
  const text = readFileSync(join(process.cwd(), 'src/services/gpu/shaders/mcpm/io.wesl'), 'utf-8');
  const bindings = parseGroup1Bindings(text);

  const slotsFor = (names: readonly string[]): number[] =>
    names.map((name) => {
      const slot = bindings.get(name);
      if (slot === undefined) throw new Error(`io.wesl: no @group(1) binding named ${name}`);
      return slot;
    });

  it('PROPAGATE_SLOTS matches deposit/trace/agent* binding numbers', () => {
    expect(PROPAGATE_SLOTS).toEqual(
      slotsFor([
        'deposit',
        'trace',
        'agentX',
        'agentY',
        'agentZ',
        'agentPhi',
        'agentTheta',
        'agentWeight',
      ]),
    );
  });

  it('DECAY_SLOTS matches deposit/depositOut/trace binding numbers', () => {
    expect(DECAY_SLOTS).toEqual(slotsFor(['deposit', 'depositOut', 'trace']));
  });

  it('HISTOGRAM_STORAGE_SLOTS matches its subset of io.wesl’s group(1) bindings', () => {
    expect(HISTOGRAM_STORAGE_SLOTS).toEqual(
      slotsFor(['trace', 'agentX', 'agentY', 'agentZ', 'agentWeight']),
    );
  });
});

describe('DECAY_WG_EDGE parity (constants.wesl ↔ encodeStep.ts)', () => {
  it('DECAY_WG_X/Y/Z all equal DECAY_WG_EDGE', () => {
    const text = readFileSync(
      join(process.cwd(), 'src/services/gpu/shaders/mcpm/constants.wesl'),
      'utf-8',
    );
    const re = /override\s+(DECAY_WG_[XYZ])\s*:\s*u32\s*=\s*(\d+)u?\s*;/g;
    const found = new Map<string, number>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) found.set(m[1]!, parseInt(m[2]!, 10));

    for (const name of ['DECAY_WG_X', 'DECAY_WG_Y', 'DECAY_WG_Z']) {
      expect(found.get(name), `${name} is missing from constants.wesl`).toBeDefined();
      expect(found.get(name)).toBe(DECAY_WG_EDGE);
    }
  });
});
