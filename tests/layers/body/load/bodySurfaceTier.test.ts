/**
 * bodySurfaceTier — which whole-globe surface texture a body is actually rendering, as a tier. The
 * tile planner's base level derives from it, and "the tier the session asked for" vs "the tier that
 * committed" differ for as long as an 8 MB JPEG downloads during a tier swap; the error is invisible
 * (ground a level softer, or a tile two levels above its base). Both cases are a slot whose
 * `lastRequest()` disagrees with the requested tier, and only the slot's load state tells them apart.
 */

import { describe, expect, it } from 'vitest';
import { bodySurfaceTier } from '../../../../src/layers/body/load/bodySurfaceTier';
import { bodyTextureSlotKey } from '../../../../src/layers/body/load/bodyTextureSlotKey';
import type { BodyRuntime } from '../../../../src/layers/body/@types/BodyRuntime';
import type { Tier } from '../../../../src/@types/data/Tier';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

/** The body's texture slots, with an `earth:surface` slot in `kind` holding a request for
 *  `requestTier` and a committed request of `committedTier` (none: nothing committed yet). */
function slotsWith(slot?: {
  kind: string;
  requestTier: Tier;
  committedTier?: Tier;
}): BodyRuntime['textureSlots'] {
  const slots = new Map<string, unknown>();
  if (slot) {
    const committedTier = slot.committedTier;
    slots.set(bodyTextureSlotKey('earth', 'surface'), {
      state: () => ({ kind: slot.kind }),
      lastRequest: () => ({ bodyId: 'earth', kind: 'surface', tier: slot.requestTier }),
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
  return slots as unknown as BodyRuntime['textureSlots'];
}

const EARTH = asSceneBodyId('earth');

describe('bodySurfaceTier', () => {
  it('reports the committed tier, not the app-wide request, while the two differ', () => {
    // The user has asked for `large`; the 4096 image is still the one on the GPU,
    // and its level is the one the tiles have to refine on top of.
    expect(
      bodySurfaceTier(
        slotsWith({ kind: 'ready', requestTier: 'medium', committedTier: 'medium' }),
        'large',
        EARTH,
      ),
    ).toBe('medium');
  });

  it('falls back to the requested tier while nothing is committed', () => {
    // No slot (pre-bootstrap), and a slot mid-fetch: in neither case is there a
    // whole-globe image whose level can be named, so the answer is the one that
    // is arriving. `lastRequest()` alone would be read as gospel here, which is
    // the requested tier again by a longer route.
    expect(bodySurfaceTier(slotsWith(), 'small', EARTH)).toBe('small');
    expect(
      bodySurfaceTier(slotsWith({ kind: 'loading', requestTier: 'large' }), 'small', EARTH),
    ).toBe('small');
  });

  it('a body-texture slot reloading at a new tier keeps reporting the committed tier', () => {
    // `lastRequest()` already reports the NEW tier the instant a reload starts
    // (`AssetSlot.ts` sets it at the top of `load()`), so reading it here would
    // claim a level the bound image doesn't carry yet. `committed()` still holds
    // the previous ready state until the reload's commit lands.
    expect(
      bodySurfaceTier(
        slotsWith({ kind: 'loading', requestTier: 'large', committedTier: 'medium' }),
        'large',
        EARTH,
      ),
    ).toBe('medium');
  });
});
