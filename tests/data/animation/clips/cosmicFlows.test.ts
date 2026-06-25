/**
 * cosmicFlows — unit tests for the clip's shape and cue sequence.
 *
 * These tests treat `cosmicFlows` as plain data (it IS plain data) and assert
 * on its structure without running a clipPlayer or compileClip. The load-bearing
 * behavioural properties — that the opacity composition actually works end-to-end
 * — are proven in `tests/state/tour/tour.integration.test.ts`.
 *
 * ### What is asserted here and why
 *
 * 1. The clip type-checks (tsc confirms it; at runtime we check `timeline.length`
 *    to catch an authored-vs-expected mismatch that TypeScript cannot catch).
 * 2. The `fade(['flow'], 0, 0)` mask fires BEFORE `scene(setFlow)` — ordering
 *    inside the timeline array is sequential.
 * 3. The crossfade `all([fade flow→1, fade survey→0])` is a concurrent node.
 * 4. The final fade-to-black covers the four layers that must dim at clip end.
 *
 * Assertions on `kind`, `layers`, `to`, `over` fields confirm the constructors
 * produced the correct effect tree without testing every field on every node.
 */

import { describe, expect, it } from 'vitest';
import { cosmicFlows } from '../../../../src/data/animation/clips/cosmicFlows';
import type { SceneEffect } from '../../../../src/@types/animation/SceneEffect';

// The authored timeline lives on the Clip's `data` field; these tests assert on
// the ClipData, not the id/label wrapper.
const clip = cosmicFlows.data;

// Convenience: cast an Effect to SceneEffect when we know the kind.
function asScene(e: unknown): SceneEffect {
  return e as SceneEffect;
}

describe('cosmicFlows clip', () => {
  it('has a fixed start pose (not live)', () => {
    // The clip is scripted from a specific vantage point — not a user-triggered live start.
    const start = clip.start;
    expect(start).not.toBe('live');
    expect(start).toBeDefined();
    // Shape: target near the LG bary, close-in distance.
    if (typeof start === 'object' && start !== null) {
      expect(start.distance).toBe(0.14);
    }
  });

  it('has preroll of 2 seconds', () => {
    expect(clip.preroll).toBe(2);
  });

  it('has 10 top-level timeline entries', () => {
    // hide, fade(mask), scene, fork(osc), fork(rate), hold,
    // all(crossfade), all(dolly+rate), hold, fade(to-black).
    expect(clip.timeline).toHaveLength(10);
  });

  it('the flow mask (fade flow→0 instant) precedes the scene enable cue', () => {
    // Timeline entries 1 and 2 (0-indexed).
    const fadeMask = asScene(clip.timeline[1]);
    const sceneEnable = asScene(clip.timeline[2]);

    expect(fadeMask.kind).toBe('fade');
    if (fadeMask.kind === 'fade') {
      expect(fadeMask.layers).toEqual(['flow']);
      expect(fadeMask.to).toBe(0);
      expect(fadeMask.over).toBe(0);
    }

    expect(sceneEnable.kind).toBe('scene');
    // After the mask lands, the scene cue enables the flow field.
    // Ordering in the timeline array guarantees the mask is emitted first
    // (compileClip processes sequentially, so atSec is the same for both,
    // but the mask index is lower — it fires before in the iteration).
  });

  it('the crossfade all-node fades flow in and survey out simultaneously', () => {
    // Timeline entry 6 — the concurrent crossfade block.
    const crossfade = clip.timeline[6] as { kind: string; children: SceneEffect[] };

    expect(crossfade.kind).toBe('all');
    expect(crossfade.children).toHaveLength(2);

    const [fadeFlow, fadeSurvey] = crossfade.children;

    expect(fadeFlow?.kind).toBe('fade');
    if (fadeFlow?.kind === 'fade') {
      expect(fadeFlow.layers).toEqual(['flow']);
      expect(fadeFlow.to).toBe(1); // reveal flow
      expect(fadeFlow.over).toBe(3); // 3-second lift
    }

    expect(fadeSurvey?.kind).toBe('fade');
    if (fadeSurvey?.kind === 'fade') {
      expect(fadeSurvey.layers).toEqual(['survey']);
      expect(fadeSurvey.to).toBe(0); // dim galaxies
      expect(fadeSurvey.over).toBe(3);
    }
  });

  it('the final fade-to-black covers the four expected layers', () => {
    // Timeline entry 9 — the closing fade.
    const fadeOut = asScene(clip.timeline[9]);

    expect(fadeOut.kind).toBe('fade');
    if (fadeOut.kind === 'fade') {
      expect(fadeOut.to).toBe(0);
      expect(fadeOut.over).toBe(3);
      // All four layers must fade out at clip end (via clipOpacity — intent untouched).
      expect(fadeOut.layers).toContain('flow');
      expect(fadeOut.layers).toContain('milkyWayDisk');
      expect(fadeOut.layers).toContain('structureRing');
      expect(fadeOut.layers).toContain('surveyLabel');
    }
  });

  it('the dolly block is an all-node with a seq child and a rate child', () => {
    // Timeline entry 7 — the concurrent pull-back block.
    const dollyBlock = clip.timeline[7] as {
      kind: string;
      children: { kind: string }[];
    };

    expect(dollyBlock.kind).toBe('all');
    expect(dollyBlock.children).toHaveLength(2);

    const [seqChild, rateChild] = dollyBlock.children;
    expect(seqChild?.kind).toBe('seq');
    expect(rateChild?.kind).toBe('rate');
  });
});
