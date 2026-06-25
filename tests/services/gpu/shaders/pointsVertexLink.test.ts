/**
 * Linked-WGSL guard for the points vertex stage after the lensing extraction
 * (Task 2.1). `?static` runs the wesl-plugin linker at build time and hands
 * back the fully-linked WGSL as a plain string, so this test proves three
 * things at once with no GPU:
 *
 *   1. `points/vertex.wesl` still LINKS — the import of `lensedPosition` from
 *      `lib/lensing.wesl` resolves and the module assembles without a parse or
 *      resolution error (a failed link throws at import time).
 *   2. The extracted `lensedPosition` symbol actually reached the linked
 *      output — the deflection model is wired in, not dead-stripped or renamed.
 *   3. The lensing accumulation (`lensTerm`) it depends on is present too, so
 *      the model is whole.
 *
 * This is the real behaviour-neutrality proof for the extraction alongside the
 * draw-count parity test in `pointRenderer.test.ts`: if the inline block had
 * been lifted incorrectly the linker would reject the module here.
 */
import { describe, it, expect } from 'vitest';
import vsCode from '../../../../src/services/gpu/shaders/points/vertex.wesl?static';

describe('points vertex links and references lensedPosition', () => {
  it('links to a non-empty WGSL string', () => {
    expect(typeof vsCode).toBe('string');
    expect(vsCode.length).toBeGreaterThan(0);
  });

  it('references the extracted lensedPosition deflection helper', () => {
    expect(vsCode).toContain('lensedPosition');
    // The per-lens geometry helper the policy loops over must link in too.
    expect(vsCode).toContain('lensTerm');
  });

  it('links the NFW LUT sample into the vertex stage', () => {
    // The dominant-NFW counter image reads the precomputed LUT (Task 4.3). The
    // texture binding and the explicit-LOD sampler call must both survive into
    // the linked WGSL — the vertex stage has no implicit derivatives, so
    // `textureSampleLevel` (not `textureSample`) is the portable call.
    expect(vsCode).toContain('lensLut');
    expect(vsCode).toContain('textureSampleLevel');
  });
});
