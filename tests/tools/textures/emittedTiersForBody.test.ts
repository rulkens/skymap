/**
 * Tests for emittedTiersForBody — the registry policy ceiling that decides
 * which tiers `build-textures` may ever ship for a body.
 *
 * The only thing that can break here is the ceiling → tier-prefix mapping: a
 * body must never be offered a tier above its `maxTier` (the never-upscale
 * contract, spec §3). The three cases below are hand-derived from the distinct
 * ceilings in the registry (`small` / `medium` / `large`) — not a restatement of
 * the whole registry, just one witness per ceiling.
 */

import { describe, expect, it } from 'vitest';
import { emittedTiersForBody } from '../../../tools/textures/emittedTiersForBody';

describe('emittedTiersForBody', () => {
  it('honours the maxTier ceiling — a body ships every tier up to it, none above', () => {
    // Uranus caps at `small` (near-featureless disc, 2 k source only).
    expect(emittedTiersForBody('uranus')).toEqual(['small']);
    // Venus caps at `medium` (cloud imaged at 4 k, no 8 k detail exists).
    expect(emittedTiersForBody('venus')).toEqual(['small', 'medium']);
    // Mars runs the full ladder to `large` (8 k SSS source).
    expect(emittedTiersForBody('mars')).toEqual(['small', 'medium', 'large']);
  });
});
