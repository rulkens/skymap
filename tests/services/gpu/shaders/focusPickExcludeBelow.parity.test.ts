/**
 * Parity guard: `FOCUS_PICK_EXCLUDE_BELOW` is authored in `lib/focusUniforms.wesl`
 * (the survey shaders' pick cut) and mirrored in TS for the CPU-stamped star
 * picks. `?static` linking injects no values, so a test keeps the two in step.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FOCUS_PICK_EXCLUDE_BELOW } from '../../../../src/data/focusPickExcludeBelow';

describe('focusUniforms.wesl ↔ focusPickExcludeBelow.ts parity', () => {
  it('the shader threshold matches the TS mirror', () => {
    const path = join(process.cwd(), 'src/services/gpu/shaders/lib/focusUniforms.wesl');
    const match = /const\s+FOCUS_PICK_EXCLUDE_BELOW\s*:\s*f32\s*=\s*([0-9.]+)/.exec(
      readFileSync(path, 'utf-8'),
    );
    expect(match, 'FOCUS_PICK_EXCLUDE_BELOW not found in focusUniforms.wesl').not.toBeNull();
    expect(parseFloat(match![1]!)).toBe(FOCUS_PICK_EXCLUDE_BELOW);
  });
});
