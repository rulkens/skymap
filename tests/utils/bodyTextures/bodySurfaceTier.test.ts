/**
 * bodySurfaceTier — which whole-globe surface texture a body is actually
 * rendering, expressed as its tier.
 *
 * The tile planner's base level is derived from this, so the difference between
 * "the tier the session asked for" and "the tier that committed" is the
 * difference between planning against pixels that exist and pixels that are
 * still downloading. A tier swap holds those two apart for as long as an 8 MB
 * JPEG takes, and getting it wrong is invisible: the ground is simply a level
 * softer than it should be for a few seconds, or a tile lands two levels above
 * its base.
 *
 * Both cases are the same shape — a slot whose `lastRequest()` disagrees with
 * `state.tier` — and only the slot's load state tells them apart, which is the
 * one thing a test can pin down here.
 */

import { describe, expect, it } from 'vitest';

import { bodySurfaceTier } from '../../../src/utils/bodyTextures/bodySurfaceTier';
import { bodyTextureSlotKey } from '../../../src/utils/bodyTextures/bodyTextureSlotKey';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { Tier } from '../../../src/@types/data/Tier';

/** An engine state whose `earth:surface` slot is in `kind` holding a request for
 *  `requestTier`, with a committed request of `committedTier` (defaults to
 *  `requestTier`, i.e. no reload in flight), under an app-wide `tier`. */
function stateWith(input: {
  tier: Tier;
  slot?: { kind: string; requestTier: Tier; committedTier?: Tier };
}): EngineState {
  const bodyTextures = new Map<string, unknown>();
  if (input.slot) {
    const committedTier = input.slot.committedTier;
    bodyTextures.set(bodyTextureSlotKey('earth', 'surface'), {
      state: () => ({ kind: input.slot!.kind }),
      lastRequest: () => ({ bodyId: 'earth', kind: 'surface', tier: input.slot!.requestTier }),
      committed: () =>
        committedTier === undefined
          ? null
          : {
              kind: 'ready',
              req: { bodyId: 'earth', kind: 'surface', tier: committedTier },
              value: {} as ImageBitmap,
              loadedAtMs: 0,
            },
    });
  }
  return { tier: input.tier, assetSlots: { bodyTextures } } as unknown as EngineState;
}

describe('bodySurfaceTier', () => {
  it('reports the committed tier, not the app-wide request, while the two differ', () => {
    // The user has asked for `large`; the 4096 image is still the one on the GPU,
    // and its level is the one the tiles have to refine on top of.
    expect(
      bodySurfaceTier(
        stateWith({
          tier: 'large',
          slot: { kind: 'ready', requestTier: 'medium', committedTier: 'medium' },
        }),
        'earth',
      ),
    ).toBe('medium');
  });

  it('falls back to the requested tier while nothing is committed', () => {
    // No slot (pre-bootstrap), and a slot mid-fetch: in neither case is there a
    // whole-globe image whose level can be named, so the answer is the one that
    // is arriving. `lastRequest()` alone would be read as gospel here, which is
    // the requested tier again by a longer route.
    expect(bodySurfaceTier(stateWith({ tier: 'small' }), 'earth')).toBe('small');
    expect(
      bodySurfaceTier(
        stateWith({ tier: 'small', slot: { kind: 'loading', requestTier: 'large' } }),
        'earth',
      ),
    ).toBe('small');
  });

  it('a body-texture slot reloading at a new tier keeps reporting the committed tier', () => {
    // `lastRequest()` already reports the NEW tier the instant a reload starts
    // (`AssetSlot.ts` sets it at the top of `load()`), so reading it here would
    // claim a level the bound image doesn't carry yet. `committed()` still holds
    // the previous ready state until the reload's commit lands.
    expect(
      bodySurfaceTier(
        stateWith({
          tier: 'large',
          slot: { kind: 'loading', requestTier: 'large', committedTier: 'medium' },
        }),
        'earth',
      ),
    ).toBe('medium');
  });
});
