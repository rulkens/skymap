/**
 * earthFlyout tests — the clip opens on Earth's LIVE position, so its `start`
 * target must track the instant the clip is built at, not a fixed epoch. The
 * clip player freezes the clock at clip start (02-core Task 13) and hands that
 * frozen instant to the builder, so the shot opens where Earth is drawn.
 */

import { describe, it, expect } from 'vitest';
import { earthFlyout } from '../../../../src/data/animation/clips/earthFlyout';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

describe('earthFlyout', () => {
  it('targets the frozen-clock Earth (the instant it is built at)', () => {
    // Build at a clearly non-J2000 instant (Earth swept ~200 days along its
    // orbit): the start target must be Earth's snapshot position at THAT instant,
    // not at the epoch.
    const LATER = CONST_J2000 + 200;
    const start = earthFlyout(LATER).data.start as CameraPose;
    const earthLater = deriveBodyStates(LATER).get('earth')!.positionMpc;
    expect(start.target).toEqual([...earthLater]);

    // And distinctly NOT the J2000 position — the clock actually moved the aim.
    const earthJ2000 = deriveBodyStates(CONST_J2000).get('earth')!.positionMpc;
    expect(start.target).not.toEqual([...earthJ2000]);
  });

  it('carries its durable id and a non-empty timeline regardless of instant', () => {
    const clip = earthFlyout(CONST_J2000);
    expect(clip.id).toBe('earthFlyout');
    expect(clip.data.timeline.length).toBeGreaterThan(0);
  });
});
