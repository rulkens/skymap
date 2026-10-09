/**
 * Parity guard: the focus dimming constants are authored in `lib/focusUniforms.wesl`
 * and mirrored in TS for the CPU-dimmed curated stars. `?static` linking injects no
 * values, so a test keeps the two in step.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FOCUS_CORE_FRACTION } from '../../../../src/data/focusCoreFraction';
import { FOCUS_DIM_FLOOR } from '../../../../src/data/focusDimFloor';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/services/gpu/shaders/lib/focusUniforms.wesl'),
  'utf-8',
);

const weslConst = (name: string): number => {
  const match = new RegExp(`const\\s+${name}\\s*:\\s*f32\\s*=\\s*([0-9.]+)`).exec(SOURCE);
  expect(match, `${name} not found in focusUniforms.wesl`).not.toBeNull();
  return parseFloat(match![1]!);
};

describe('focusUniforms.wesl ↔ focus dimming TS constants parity', () => {
  it('the core fraction matches', () => {
    expect(weslConst('FOCUS_CORE_FRACTION')).toBe(FOCUS_CORE_FRACTION);
  });

  it('the dim floor matches', () => {
    expect(weslConst('FOCUS_DIM_FLOOR')).toBe(FOCUS_DIM_FLOOR);
  });
});
