/**
 * flyToClip tests — verify the establishing-move clip builds the correct cues
 * for a FocusId-addressed camera move.
 *
 * The builder is a pure function over a durable FocusId. Tests assert:
 *   - The clip is live-start.
 *   - The timeline contains exactly one `all` block with moveTargetId + dollyToId.
 *   - No focusId cue is present (camera-only; selection focus is not touched).
 *
 * Cue kinds come from effectHelpers constructors:
 *   - `moveTargetId` → `{ kind: 'moveTargetId', id, over, ease }`
 *   - `dollyToId`    → `{ kind: 'dollyToId',    id, over, ease }`
 *   - `all`          → `{ kind: 'all', children: [...] }`
 */

import { describe, it, expect } from 'vitest';
import { flyToClip } from '../../../src/state/tour/flyToClip';
import { focusId } from '../../../src/utils/animation/focusId';

const id = focusId('virgo');

describe('flyToClip', () => {
  it('flyToClip has no focus cue and is live-start', () => {
    const clip = flyToClip(id);

    expect(clip.start).toBe('live');
    expect(clip.timeline).toHaveLength(1);

    // Top-level entry is an `all` block for concurrent camera move + dolly.
    const allNode = clip.timeline[0];
    expect(allNode).not.toBeUndefined();
    expect(allNode!.kind).toBe('all');

    if (allNode!.kind === 'all') {
      expect(allNode.children).toHaveLength(2);

      // moveTargetId carries the FocusId for deferred world-position resolution.
      const targetMove = allNode.children[0];
      expect(targetMove).not.toBeUndefined();
      expect(targetMove!.kind).toBe('moveTargetId');
      if (targetMove!.kind === 'moveTargetId') {
        expect(targetMove.id).toBe(id);
      }

      // dollyToId carries the same FocusId for deferred distance resolution.
      const dolly = allNode.children[1];
      expect(dolly).not.toBeUndefined();
      expect(dolly!.kind).toBe('dollyToId');
      if (dolly!.kind === 'dollyToId') {
        expect(dolly.id).toBe(id);
      }
    }

    // No focusId selection cue — this is the camera-only builder.
    const json = JSON.stringify(clip.timeline);
    expect(json).not.toContain('"focusId"');
  });
});
