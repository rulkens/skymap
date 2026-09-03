import { describe, it, expect } from 'vitest';
import { skyCubemapNeedsBake } from '../../../../src/services/engine/frame/skyCubemapNeedsBake';
import type { SkyCubemapBakeKey } from '../../../../src/@types/engine/state/SkyCubemapBakeKey';

function makeKey(overrides: Partial<SkyCubemapBakeKey> = {}): SkyCubemapBakeKey {
  return {
    settings: {} as SkyCubemapBakeKey['settings'],
    selection: {} as SkyCubemapBakeKey['selection'],
    tier: 'medium',
    faceSizePx: 1024,
    fadesAnimating: false,
    ...overrides,
  };
}

describe('skyCubemapNeedsBake', () => {
  it('null baked ⇒ true', () => {
    expect(skyCubemapNeedsBake(null, makeKey())).toBe(true);
  });

  it('identical references, same primitives ⇒ false', () => {
    const key = makeKey();
    expect(skyCubemapNeedsBake(key, key)).toBe(false);
  });

  it.each([
    ['settings', { settings: {} as SkyCubemapBakeKey['settings'] }],
    ['selection', { selection: {} as SkyCubemapBakeKey['selection'] }],
    ['tier', { tier: 'small' as const }],
    ['faceSizePx', { faceSizePx: 512 }],
    ['fadesAnimating', { fadesAnimating: true }],
  ])('%s differing ⇒ true', (_name, override) => {
    const base = makeKey();
    expect(skyCubemapNeedsBake(base, makeKey({ ...base, ...override }))).toBe(true);
  });

  it('current.fadesAnimating true ⇒ true even with every other field identical to baked', () => {
    const baked = makeKey({ fadesAnimating: false });
    const current = makeKey({ ...baked, fadesAnimating: true });
    expect(skyCubemapNeedsBake(baked, current)).toBe(true);
  });

  it('a ramp settling (baked animating, current settled) ⇒ true once, then false once baked catches up', () => {
    const animating = makeKey({ fadesAnimating: true });
    const settled = makeKey({ ...animating, fadesAnimating: false });

    // The frame the ramp stops: baked still carries the mid-ramp key, current
    // has settled — one final bake to capture the resolved look.
    expect(skyCubemapNeedsBake(animating, settled)).toBe(true);

    // The next frame: baked is now the settled key too, nothing changed.
    expect(skyCubemapNeedsBake(settled, settled)).toBe(false);
  });
});
