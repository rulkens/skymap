/**
 * APP_CLIP_REGISTRY tests — every entry's `id` matches its key, and every registered clip carries
 * a non-empty label and a timeline.
 *
 * These runtime checks catch a copy-paste id/key mismatch tsc cannot see, and confirm the data
 * each clip needs to be playable and labelled is present.
 */

import { describe, it, expect } from 'vitest';
import { APP_CLIP_REGISTRY } from '../../src/compositions/appClips';

describe('APP_CLIP_REGISTRY', () => {
  it('keys each clip under its own id', () => {
    for (const [key, clip] of Object.entries(APP_CLIP_REGISTRY)) {
      expect(clip.id).toBe(key);
    }
  });

  it('gives every clip a non-empty label and a timeline', () => {
    for (const clip of Object.values(APP_CLIP_REGISTRY)) {
      expect(clip.label.length).toBeGreaterThan(0);
      expect(clip.data.timeline.length).toBeGreaterThan(0);
    }
  });
});
