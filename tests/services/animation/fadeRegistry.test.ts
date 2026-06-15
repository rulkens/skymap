import { describe, it, expect, vi } from 'vitest';
import { createFadeRegistry } from '../../../src/services/animation/fadeRegistry';
import type { FadeId } from '../../../src/@types/animation/FadeId';

// No-op wake stub for tests that don't care about the wake.
function makeRegistry() {
  return createFadeRegistry({ requestRender: () => {} });
}

describe('createFadeRegistry', () => {
  it('exposes the conventional label property', () => {
    const r = makeRegistry();
    expect(r.label).toBe('fadeRegistry');
  });

  it('opacityOf returns 1.0 for unregistered handles (fail-safe)', () => {
    const r = makeRegistry();
    const h: FadeId = { kind: 'galaxyCatalog', id: 'sdss' };
    expect(r.opacityOf(h, 1000)).toBe(1.0);
  });

  it('register defaults initial opacity to 0', () => {
    const r = makeRegistry();
    const h: FadeId = { kind: 'galaxyCatalog', id: 'sdss' };
    r.register(h);
    expect(r.opacityOf(h, 1000)).toBe(0);
  });

  it('register honors a provided initial opacity', () => {
    const r = makeRegistry();
    const h: FadeId = { kind: 'overlay', id: 'milkyWay' };
    r.register(h, 0.75);
    expect(r.opacityOf(h, 1000)).toBe(0.75);
  });

  it('register is idempotent', () => {
    const r = makeRegistry();
    const h: FadeId = { kind: 'filaments' };
    r.register(h, 0.5);
    r.register(h, 0.0); // second call is a no-op; the existing controller is preserved.
    expect(r.opacityOf(h, 1000)).toBe(0.5);
  });

  it('unregister drops the controller; opacityOf reverts to fail-safe 1.0', () => {
    const r = makeRegistry();
    const h: FadeId = { kind: 'filaments' };
    r.register(h, 0);
    r.unregister(h);
    expect(r.opacityOf(h, 1000)).toBe(1.0);
  });

  it('serialization is stable across handle equality', () => {
    const r = makeRegistry();
    const h1: FadeId = { kind: 'galaxyCatalog', id: 'sdss' };
    const h2: FadeId = { kind: 'galaxyCatalog', id: 'sdss' };
    r.register(h1, 0.5);
    // Two structurally-equal handles map to the same controller.
    expect(r.opacityOf(h2, 1000)).toBe(0.5);
  });

  it('different discriminator values produce different keys', () => {
    const r = makeRegistry();
    const a: FadeId = { kind: 'galaxyCatalog', id: 'sdss' };
    const b: FadeId = { kind: 'galaxyCatalog', id: 'glade' };
    r.register(a, 0.25);
    r.register(b, 0.75);
    expect(r.opacityOf(a, 1000)).toBe(0.25);
    expect(r.opacityOf(b, 1000)).toBe(0.75);
  });

  it('serializes the flow handle to its own key (distinct from filaments)', () => {
    const r = makeRegistry();
    const flow: FadeId = { kind: 'flow' };
    const filaments: FadeId = { kind: 'filaments' };
    r.register(flow, 0.3);
    r.register(filaments, 0.6);
    // Distinct keys → distinct controllers; neither bleeds into the other.
    expect(r.opacityOf(flow, 1000)).toBe(0.3);
    expect(r.opacityOf(filaments, 1000)).toBe(0.6);
  });

  it('fadeTo throws when the handle is not registered and does not wake', () => {
    const requestRender = vi.fn();
    const r = createFadeRegistry({ requestRender });
    const h: FadeId = { kind: 'filaments' };
    expect(() => r.fadeTo(h, 1, 600)).toThrow();
    expect(requestRender).not.toHaveBeenCalled();
  });

  it('fadeTo ramps opacity and resolves via tick', async () => {
    const r = makeRegistry();
    const h: FadeId = { kind: 'filaments' };
    r.register(h, 0);
    let done = false;
    r.fadeTo(h, 1, 600, 0).then(() => {
      done = true;
    });
    expect(r.opacityOf(h, 0)).toBeCloseTo(0, 5);
    expect(r.opacityOf(h, 300)).toBeCloseTo(0.5, 5);
    expect(r.opacityOf(h, 600)).toBeCloseTo(1, 5);
    r.tick(600);
    await Promise.resolve();
    expect(done).toBe(true);
  });

  it('setImmediate skips animation', () => {
    const r = makeRegistry();
    const h: FadeId = { kind: 'overlay', id: 'milkyWay' };
    r.register(h, 0);
    r.setImmediate(h, 1);
    expect(r.opacityOf(h, 0)).toBe(1);
    expect(r.isAnyAnimating(0)).toBe(false);
  });

  it('isAnyAnimating aggregates across multiple controllers', () => {
    const r = makeRegistry();
    const a: FadeId = { kind: 'galaxyCatalog', id: 'sdss' };
    const b: FadeId = { kind: 'filaments' };
    r.register(a, 0);
    r.register(b, 1);
    expect(r.isAnyAnimating(0)).toBe(false);
    r.fadeTo(a, 1, 600, 1000); // start fade-in anchored at t=1000
    // Mid-ramp at t=1300 — still animating.
    expect(r.isAnyAnimating(1300)).toBe(true);
    // After the ramp ends at t=1600 — no longer animating.
    expect(r.isAnyAnimating(1700)).toBe(false);
  });

  it('serializeFadeId keys markerLayer by category', () => {
    const r = makeRegistry();
    const cluster: FadeId = { kind: 'markerLayer', category: 'cluster' };
    const aVoid: FadeId = { kind: 'markerLayer', category: 'void' };
    r.register(cluster, 0);
    r.register(aVoid, 0);
    r.fadeTo(cluster, 0.25, 0, 0);
    r.fadeTo(aVoid, 0.75, 0, 0);
    // Distinct categories must address distinct controllers.
    expect(r.opacityOf(cluster, 0)).toBeCloseTo(0.25, 5);
    expect(r.opacityOf(aVoid, 0)).toBeCloseTo(0.75, 5);
  });

  it('serializeFadeId keeps a category-less labelLayer distinct from a per-category one', () => {
    const r = makeRegistry();
    const bare: FadeId = { kind: 'labelLayer', layer: 'structure' };
    const perCategory: FadeId = { kind: 'labelLayer', layer: 'structure', category: 'cluster' };
    r.register(bare, 0);
    r.register(perCategory, 0);
    r.fadeTo(bare, 0.2, 0, 0);
    r.fadeTo(perCategory, 0.8, 0, 0);
    expect(r.opacityOf(bare, 0)).toBeCloseTo(0.2, 5);
    expect(r.opacityOf(perCategory, 0)).toBeCloseTo(0.8, 5);
  });

  it('serializeFadeId leaves youAreHere label key unchanged', () => {
    const r = makeRegistry();
    const h: FadeId = { kind: 'labelLayer', layer: 'youAreHere' };
    r.register(h, 0);
    r.fadeTo(h, 1, 0, 0);
    // Legacy category-less label handle behaves exactly as before.
    expect(r.opacityOf(h, 0)).toBeCloseTo(1, 5);
  });

  it('destroy clears every controller', () => {
    const r = makeRegistry();
    const h: FadeId = { kind: 'filaments' };
    r.register(h, 0.5);
    r.destroy();
    expect(r.opacityOf(h, 0)).toBe(1.0);
    expect(r.isAnyAnimating(0)).toBe(false);
  });

  it('fadeTo wakes the scheduler', () => {
    const requestRender = vi.fn();
    const r = createFadeRegistry({ requestRender });
    const h: FadeId = { kind: 'filaments' };
    r.register(h, 0);
    r.fadeTo(h, 1, 600, 0);
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('register, unregister, setImmediate, tick and opacityOf do not wake', () => {
    const requestRender = vi.fn();
    const r = createFadeRegistry({ requestRender });
    const h: FadeId = { kind: 'filaments' };
    r.register(h, 0);
    r.setImmediate(h, 0.5);
    r.tick(100);
    r.opacityOf(h, 100);
    r.unregister(h);
    expect(requestRender).not.toHaveBeenCalled();
  });
});
