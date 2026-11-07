import { describe, it, expect, vi } from 'vitest';
import {
  createStructureFocusSubsystem,
  ZERO_FOCUS,
} from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import type { FocusSubject } from '../../../../src/@types/engine/subsystems/FocusSubject';
import type { FocusSphere } from '../../../../src/@types/rendering/FocusSphere';
import { RECEDE_ALL_FOCUS_SPHERE } from '../../../../src/data/selection/recedeAllFocusSphere';

function makeCluster(id = 'virgo', sphere: Partial<FocusSphere> = {}): FocusSubject {
  return {
    ref: { type: 'structure', id },
    sphere: { center: [10, 0, 0], apparentRadiusMpc: 2, physicalRadiusMpc: 2, ...sphere },
  };
}

const STREAM: FocusSubject = {
  ref: { type: 'stellarStream', slug: 'cetus-palca' },
  sphere: RECEDE_ALL_FOCUS_SPHERE,
};

// Every subject's kind fully shown: the focus ramps as its fades alone say.
const SHOWN = () => 1;

// Factory helper — passes a no-op wake function for tests that don't inspect it.
function makeStructureFocus(initialNowMs = 0) {
  return createStructureFocusSubsystem({ requestRender: () => {} }, initialNowMs);
}

describe('structureFocusSubsystem', () => {
  it('a subject with a sphere fades sphere and blend 0→1 together, with its centre/radii', () => {
    const sub = makeStructureFocus(0);
    sub.update(makeCluster('virgo', { center: [3, 4, 5], apparentRadiusMpc: 5 }), 0);
    const mid = sub.produceFocus(200, SHOWN);
    expect(mid.blend).toBeGreaterThan(0);
    expect(mid.blend).toBeLessThan(1);
    expect(mid.uniforms.blend).toBe(mid.blend);
    const settled = sub.produceFocus(500, SHOWN);
    expect(settled.blend).toBe(1);
    expect(settled.uniforms).toEqual({
      center: [3, 4, 5],
      apparentRadiusMpc: 5,
      physicalRadiusMpc: 2,
      blend: 1,
    });
    expect(settled.ref).toEqual({ type: 'structure', id: 'virgo' });
  });

  it('lastFocus returns the produced value without advancing the fade', () => {
    const sub = makeStructureFocus(0);
    expect(sub.lastFocus().blend).toBe(0);
    sub.update(makeCluster(), 0);
    const mid = sub.produceFocus(200, SHOWN);
    expect(sub.lastFocus()).toBe(mid);
  });

  it('update(null) fades blend 1→0 keeping the ref latched, without restarting per frame', () => {
    const sub = makeStructureFocus(0);
    sub.update(makeCluster(), 0);
    sub.produceFocus(500, SHOWN); // settle at 1
    sub.update(null, 500);
    const mid = sub.produceFocus(600, SHOWN);
    expect(mid.blend).toBeGreaterThan(0);
    expect(mid.blend).toBeLessThan(1);
    expect(mid.ref).toEqual({ type: 'structure', id: 'virgo' });
    // Next frame: selection still null. Must NOT restart the fade-out clock.
    sub.update(null, 600);
    const settled = sub.produceFocus(900, SHOWN);
    expect(settled.blend).toBe(0);
    expect(settled.ref).toBeNull();
  });

  it('the same ref re-observed each frame does not restart the ramp, even as a fresh object', () => {
    const sub = makeStructureFocus(0);
    sub.update(makeCluster(), 0);
    sub.produceFocus(100, SHOWN); // mid fade-in
    sub.update(makeCluster(), 100);
    sub.update(makeCluster(), 200);
    expect(sub.produceFocus(500, SHOWN).blend).toBe(1);
  });

  it('structure → stream fades the sphere out, then the recede-all sphere in, the blend holding at 1', () => {
    const sub = makeStructureFocus(0);
    sub.update(makeCluster('virgo'), 0);
    sub.produceFocus(500, SHOWN); // settle at 1
    sub.update(STREAM, 500);
    const out = sub.produceFocus(700, SHOWN);
    expect(out.blend).toBe(1);
    expect(out.ref).toEqual(STREAM.ref);
    expect(out.uniforms.center).toEqual([10, 0, 0]);
    expect(out.uniforms.blend).toBeGreaterThan(0);
    expect(out.uniforms.blend).toBeLessThan(1);
    // Faded out, the recede-all sphere still waiting: the loop must not sleep through the hand-off.
    expect(sub.isAwake(900)).toBe(true);
    const handOff = sub.produceFocus(900, SHOWN);
    expect(handOff.uniforms).toEqual({ ...RECEDE_ALL_FOCUS_SPHERE, blend: 0 });
    const into = sub.produceFocus(1100, SHOWN);
    expect(into.uniforms.blend).toBeGreaterThan(0);
    expect(into.uniforms.blend).toBeLessThan(1);
    expect(sub.produceFocus(1300, SHOWN).uniforms).toEqual({
      ...RECEDE_ALL_FOCUS_SPHERE,
      blend: 1,
    });
  });

  it('structure → structure fades through 0 too, never snapping the bright region across', () => {
    const sub = makeStructureFocus(0);
    sub.update(makeCluster('virgo'), 0);
    sub.produceFocus(500, SHOWN);
    sub.update(makeCluster('coma', { center: [-10, 0, 0] }), 600);
    expect(sub.produceFocus(800, SHOWN).uniforms.center).toEqual([10, 0, 0]);
    sub.produceFocus(1000, SHOWN);
    const settled = sub.produceFocus(1400, SHOWN);
    expect(settled.uniforms.center).toEqual([-10, 0, 0]);
    expect(settled.uniforms.blend).toBe(1);
  });

  it('stream → stream keeps the recede-all sphere at full, a value-equal copy included', () => {
    const sub = makeStructureFocus(0);
    sub.update(STREAM, 0);
    sub.produceFocus(500, SHOWN);
    sub.update(
      { ref: { type: 'stellarStream', slug: 'gd-1' }, sphere: { ...RECEDE_ALL_FOCUS_SPHERE } },
      500,
    );
    expect(sub.produceFocus(700, SHOWN).uniforms.blend).toBe(1);
  });

  it("scales both blends by the latched subject's shown value, and lastFocus is the scaled frame", () => {
    const sub = makeStructureFocus(0);
    sub.update(STREAM, 0);
    const hidden = sub.produceFocus(500, () => 0);
    expect(hidden.blend).toBe(0);
    expect(hidden.uniforms.blend).toBe(0);
    expect(hidden.ref).toEqual(STREAM.ref);
    expect(sub.lastFocus()).toBe(hidden);
    const half = sub.produceFocus(600, (ref) => (ref.type === 'stellarStream' ? 0.5 : 1));
    expect(half.blend).toBe(0.5);
    expect(half.uniforms.blend).toBe(0.5);
  });

  it('isAwake is true mid-fade and false at rest', () => {
    const sub = makeStructureFocus(0);
    expect(sub.isAwake(0)).toBe(false);
    sub.update(makeCluster(), 0);
    expect(sub.isAwake(200)).toBe(true);
    sub.produceFocus(500, SHOWN);
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
