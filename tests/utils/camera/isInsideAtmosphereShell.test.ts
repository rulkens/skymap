/**
 * isInsideAtmosphereShell — the inside/outside classifier that switches
 * `atmosphereShellLayer` between the outside proxy-mesh pipelines and the
 * inside full-screen pipelines. `camPosLocal` is already in atmosphere-top
 * radius units (1 = the shell's outer extent), so the test straddles that
 * boundary rather than restating the constant `1` itself (per testing.md).
 */

import { describe, expect, it } from 'vitest';

import { isInsideAtmosphereShell } from '../../../src/utils/camera/isInsideAtmosphereShell';

describe('isInsideAtmosphereShell', () => {
  it('classifies values straddling the unit-sphere boundary', () => {
    expect(isInsideAtmosphereShell([0.999, 0, 0])).toBe(true);
    expect(isInsideAtmosphereShell([1.001, 0, 0])).toBe(false);
  });
});
