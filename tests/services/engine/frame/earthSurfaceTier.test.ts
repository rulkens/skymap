/**
 * earthSurfaceTier — which whole-globe surface texture Earth is actually
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

import { earthSurfaceTier } from '../../../../src/services/engine/frame/earthSurfaceTier';
import { bodyTextureSlotKey } from '../../../../src/utils/scene/bodyTextureSlotKey';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Tier } from '../../../../src/@types/data/Tier';

/** An engine state whose `earth:surface` slot is in `kind` holding a request for
 *  `requestTier`, under an app-wide `tier`. */
function stateWith(input: { tier: Tier; slot?: { kind: string; requestTier: Tier } }): EngineState {
  const bodyTextures = new Map<string, unknown>();
  if (input.slot) {
    bodyTextures.set(bodyTextureSlotKey('earth', 'surface'), {
      state: () => ({ kind: input.slot!.kind }),
      lastRequest: () => ({ bodyId: 'earth', kind: 'surface', tier: input.slot!.requestTier }),
    });
  }
  return { tier: input.tier, assetSlots: { bodyTextures } } as unknown as EngineState;
}

describe('earthSurfaceTier', () => {
  it('reports the committed tier, not the app-wide request, while the two differ', () => {
    // The user has asked for `large`; the 4096 image is still the one on the GPU,
    // and its level is the one the tiles have to refine on top of.
    expect(
      earthSurfaceTier(
        stateWith({ tier: 'large', slot: { kind: 'ready', requestTier: 'medium' } }),
      ),
    ).toBe('medium');
  });

  it('falls back to the requested tier while nothing is committed', () => {
    // No slot (pre-bootstrap), and a slot mid-fetch: in neither case is there a
    // whole-globe image whose level can be named, so the answer is the one that
    // is arriving. `lastRequest()` alone would be read as gospel here, which is
    // the requested tier again by a longer route.
    expect(earthSurfaceTier(stateWith({ tier: 'small' }))).toBe('small');
    expect(
      earthSurfaceTier(
        stateWith({ tier: 'small', slot: { kind: 'loading', requestTier: 'large' } }),
      ),
    ).toBe('small');
  });
});
