import { describe, it, expect, vi } from 'vitest';
import {
  createStructureFocusSubsystem,
  ZERO_FOCUS,
} from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import type { FocusSubject } from '../../../../src/@types/engine/subsystems/FocusSubject';
import type { FocusSphere } from '../../../../src/@types/rendering/FocusSphere';

function makeCluster(id = 'virgo', sphere: Partial<FocusSphere> = {}): FocusSubject {
  return {
    ref: { type: 'structure', id },
    sphere: { center: [10, 0, 0], apparentRadiusMpc: 2, physicalRadiusMpc: 2, ...sphere },
  };
}

const STREAM: FocusSubject = { ref: { type: 'stellarStream', slug: 'cetus-palca' }, sphere: null };

// Factory helper — passes a no-op wake function for tests that don't inspect it.
function makeStructureFocus(initialNowMs = 0) {
  return createStructureFocusSubsystem({ requestRender: () => {} }, initialNowMs);
}

describe('structureFocusSubsystem', () => {
  it('a subject with a sphere fades sphere and blend 0→1 together, with its centre/radii', () => {
    const sub = makeStructureFocus(0);
    sub.update(makeCluster('virgo', { center: [3, 4, 5], apparentRadiusMpc: 5 }), 0);
    const mid = sub.produceFocus(200);
    expect(mid.blend).toBeGreaterThan(0);
    expect(mid.blend).toBeLessThan(1);
    expect(mid.uniforms.blend).toBe(mid.blend);
    const settled = sub.produceFocus(500);
    expect(settled.blend).toBe(1);
    expect(settled.uniforms).toEqual({
      center: [3, 4, 5],
      apparentRadiusMpc: 5,
      physicalRadiusMpc: 2,
      blend: 1,
    });
    expect(settled.ref).toEqual({ type: 'structure', id: 'virgo' });
  });

  it('a subject with no sphere ramps the blend and names its ref, the sphere staying at rest', () => {
    const sub = makeStructureFocus(0);
    sub.update(STREAM, 0);
    const settled = sub.produceFocus(500);
    expect(settled.blend).toBe(1);
    expect(settled.ref).toEqual(STREAM.ref);
    expect(settled.uniforms).toBe(ZERO_FOCUS);
  });

  it('lastFocus returns the produced value without advancing the fade', () => {
    const sub = makeStructureFocus(0);
    expect(sub.lastFocus().blend).toBe(0);
    sub.update(makeCluster(), 0);
    const mid = sub.produceFocus(200);
    expect(sub.lastFocus()).toBe(mid);
  });

  it('update(null) fades blend 1→0 keeping the ref latched, without restarting per frame', () => {
    const sub = makeStructureFocus(0);
    sub.update(makeCluster(), 0);
    sub.produceFocus(500); // settle at 1
    sub.update(null, 500);
    const mid = sub.produceFocus(600);
    expect(mid.blend).toBeGreaterThan(0);
    expect(mid.blend).toBeLessThan(1);
    expect(mid.ref).toEqual({ type: 'structure', id: 'virgo' });
    // Next frame: selection still null. Must NOT restart the fade-out clock.
    sub.update(null, 600);
    const settled = sub.produceFocus(900);
    expect(settled.blend).toBe(0);
    expect(settled.ref).toBeNull();
  });

  it('the same ref re-observed each frame does not restart the ramp, even as a fresh object', () => {
    const sub = makeStructureFocus(0);
    sub.update(makeCluster(), 0);
    sub.produceFocus(100); // mid fade-in
    sub.update(makeCluster(), 100);
    sub.update(makeCluster(), 200);
    expect(sub.produceFocus(500).blend).toBe(1);
  });

  it('replacing a structure with a structure keeps both blends at 1', () => {
    const sub = makeStructureFocus(0);
    sub.update(makeCluster('virgo'), 0);
    sub.produceFocus(500); // settle at 1
    sub.update(makeCluster('coma', { center: [-10, 0, 0] }), 600);
    expect(sub.produceFocus(601).blend).toBeCloseTo(1, 5);
    const settled = sub.produceFocus(1000);
    expect(settled.uniforms.center).toEqual([-10, 0, 0]);
    expect(settled.uniforms.blend).toBe(1);
  });

  it('structure → stream fades the sphere out over the ramp while the blend holds at 1', () => {
    const sub = makeStructureFocus(0);
    sub.update(makeCluster('virgo'), 0);
    sub.produceFocus(500); // settle at 1
    sub.update(STREAM, 500);
    const mid = sub.produceFocus(700);
    expect(mid.blend).toBe(1);
    expect(mid.ref).toEqual(STREAM.ref);
    expect(mid.uniforms.center).toEqual([10, 0, 0]);
    expect(mid.uniforms.blend).toBeGreaterThan(0);
    expect(mid.uniforms.blend).toBeLessThan(1);
    expect(sub.isAwake(700)).toBe(true);
    expect(sub.produceFocus(900).uniforms).toBe(ZERO_FOCUS);
  });

  it('stream → structure fades the sphere in from 0', () => {
    const sub = makeStructureFocus(0);
    sub.update(STREAM, 0);
    sub.produceFocus(500); // settle at 1
    sub.update(makeCluster('virgo'), 500);
    expect(sub.produceFocus(501).uniforms.blend).toBeCloseTo(0, 3);
    expect(sub.produceFocus(900).uniforms.blend).toBe(1);
  });

  it('isAwake is true mid-fade and false at rest', () => {
    const sub = makeStructureFocus(0);
    expect(sub.isAwake(0)).toBe(false);
    sub.update(makeCluster(), 0);
    expect(sub.isAwake(200)).toBe(true);
    sub.produceFocus(500);
    expect(sub.isAwake(500)).toBe(false);
  });

  it('update wakes the scheduler on each transition, never on steady frames', () => {
    const requestRender = vi.fn();
    const sub = createStructureFocusSubsystem({ requestRender }, 0);
    sub.update(makeCluster(), 0);
    sub.update(makeCluster(), 16);
    sub.update(makeCluster(), 32);
    expect(requestRender).toHaveBeenCalledTimes(1);
    sub.update(null, 100);
    expect(requestRender).toHaveBeenCalledTimes(2);
  });
});
