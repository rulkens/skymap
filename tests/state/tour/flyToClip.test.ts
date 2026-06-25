/**
 * flyToClip tests — verify the establishing-move clip builds the correct cues.
 *
 * The builder is pure over a pre-resolved pose. Tests cover both code paths:
 *   - Focus beat + resolved pose → `all` containing `setVec/target` + `set/distance`.
 *   - Null focus (narration beat) or null resolved → hold-only clip, no camera move.
 *
 * Cue kinds come from effectHelpers constructors:
 *   - `moveTarget` → `{ kind: 'setVec', ch: 'target' }`
 *   - `dollyTo`    → `{ kind: 'set',    ch: 'distance' }`
 *   - `hold`       → `{ kind: 'hold' }`
 *   - `all`        → `{ kind: 'all', children: [...] }`
 */

import { describe, it, expect } from 'vitest';
import { flyToClip } from '../../../src/state/tour/flyToClip';
import type { BeatData } from '../../../src/@types/animation/tour/BeatData';
import type { ResolvedFocus } from '../../../src/@types/animation/tour/ResolvedFocus';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';

// A non-null SelectionRef — content is opaque to the builder; only null/non-null matters.
const someRef: SelectionRef = { type: 'structure', id: 'virgo' };

const focusBeat: BeatData = { focus: someRef, caption: 'Virgo Cluster', dwellSec: 8 };
const narrationBeat: BeatData = { focus: null, caption: 'Narration only', dwellSec: 6 };

const resolved: ResolvedFocus = { worldPos: [10, 20, 30], focusMpc: 4 };

describe('flyToClip', () => {
  it('builds a moveTarget + dollyTo to the resolved pose', () => {
    const clip = flyToClip(focusBeat, resolved);

    expect(clip.start).toBe('live');
    expect(clip.timeline).toHaveLength(1);

    // Top-level entry is an `all` block for concurrent camera + dolly.
    const allNode = clip.timeline[0];
    expect(allNode).not.toBeUndefined();
    expect(allNode!.kind).toBe('all');

    if (allNode!.kind === 'all') {
      expect(allNode.children).toHaveLength(2);

      // moveTarget emits setVec on channel 'target'.
      const targetMove = allNode.children[0];
      expect(targetMove).not.toBeUndefined();
      expect(targetMove!.kind).toBe('setVec');
      if (targetMove!.kind === 'setVec') {
        expect(targetMove.ch).toBe('target');
        expect(targetMove.to).toEqual(resolved.worldPos);
      }

      // dollyTo emits set on channel 'distance'.
      const dolly = allNode.children[1];
      expect(dolly).not.toBeUndefined();
      expect(dolly!.kind).toBe('set');
      if (dolly!.kind === 'set') {
        expect(dolly.ch).toBe('distance');
        expect(dolly.to).toBe(resolved.focusMpc);
      }
    }
  });

  it('with null focus is a hold-only clip', () => {
    const clip = flyToClip(narrationBeat, null);

    expect(clip.start).toBe('live');
    expect(clip.timeline).toHaveLength(1);

    const holdNode = clip.timeline[0];
    expect(holdNode).not.toBeUndefined();
    expect(holdNode!.kind).toBe('hold');

    // No camera move — verify there is no all/setVec/set node.
    const json = JSON.stringify(clip.timeline);
    expect(json).not.toContain('"setVec"');
    expect(json).not.toContain('"all"');
  });

  it('with non-null focus but null resolved is also hold-only', () => {
    // resolved === null means the structure was not loadable at play time.
    const clip = flyToClip(focusBeat, null);

    expect(clip.timeline).toHaveLength(1);
    expect(clip.timeline[0]!.kind).toBe('hold');
  });
});
