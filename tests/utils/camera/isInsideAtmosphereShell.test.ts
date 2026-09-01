/**
 * isInsideAtmosphereShell — the render-path selector that switches
 * `atmosphereShellLayer` between the outside proxy-mesh pipelines and the
 * inside full-screen pipelines. `camPosLocal` is already in atmosphere-top
 * radius units (1 = the shell's outer extent); the handoff sits slightly
 * outside that boundary (the proxy mesh's facet-sag margin), so probes
 * straddle the margin rather than the geometric `1` (per testing.md).
 */

import { describe, expect, it } from 'vitest';

import { isInsideAtmosphereShell } from '../../../src/utils/camera/isInsideAtmosphereShell';

describe('isInsideAtmosphereShell', () => {
  it('classifies values straddling the entry margin', () => {
    expect(isInsideAtmosphereShell([1.004, 0, 0])).toBe(true);
    expect(isInsideAtmosphereShell([1.006, 0, 0])).toBe(false);
  });
});
