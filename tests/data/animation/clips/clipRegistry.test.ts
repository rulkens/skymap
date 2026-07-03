/**
 * clipRegistry tests — freeze the registry contract: every entry's `id` matches
 * its key, and every registered clip carries a non-empty label and a timeline.
 *
 * The `Record<ClipId, Clip>` typing already proves at compile time that the
 * registry covers exactly the `ClipId` union; these runtime checks catch a
 * copy-paste id/key mismatch tsc cannot see, and confirm the data each clip
 * needs to be playable + labelled is present.
 */

import { describe, it, expect } from 'vitest';
import { clipRegistry } from '../../../../src/data/animation/clips/clipRegistry';

describe('clipRegistry', () => {
  it('keys each clip under its own id', () => {
    for (const [key, clip] of Object.entries(clipRegistry)) {
      expect(clip.id).toBe(key);
    }
  });

  it('gives every clip a non-empty label and a timeline', () => {
    for (const clip of Object.values(clipRegistry)) {
      expect(clip.label.length).toBeGreaterThan(0);
      expect(clip.data.timeline.length).toBeGreaterThan(0);
    }
  });

  it('registers the expected clips', () => {
    expect(Object.keys(clipRegistry).sort()).toEqual([
      'cosmicFlows',
      'famousFlythrough',
      'flowOrbit',
      'flyPathDemo',
      'flyout',
      'tourApproachM31',
      'tourApproachVirgo',
      'tourCosmicWeb',
      'tourNeighbourhood',
      'tourOpeningTitle',
      'tourYouAreHere',
      'tourYouAreHereDwell',
    ]);
  });
});
