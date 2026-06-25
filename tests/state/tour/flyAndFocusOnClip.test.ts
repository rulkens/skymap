/**
 * flyAndFocusOnClip tests — verify the establishing-move clip leads with a
 * focusId selection cue followed by the concurrent camera move.
 *
 * The builder is a pure function over a durable FocusId. Tests assert:
 *   - The clip is live-start.
 *   - The first timeline entry is a `focusId` cue carrying the same id.
 *   - The second timeline entry is an `all` block with moveTargetId + dollyToId.
 *
 * Cue kinds come from effectHelpers constructors:
 *   - `focus(id)` → `{ kind: 'focusId', id }`
 *   - `moveTargetId` → `{ kind: 'moveTargetId', id, over, ease }`
 *   - `dollyToId`    → `{ kind: 'dollyToId',    id, over, ease }`
 *   - `all`          → `{ kind: 'all', children: [...] }`
 */

import { describe, it, expect } from 'vitest';
import { flyAndFocusOnClip } from '../../../src/state/tour/flyAndFocusOnClip';
import { focusId } from '../../../src/utils/animation/focusId';

const id = focusId('m87');

describe('flyAndFocusOnClip', () => {
  it('flyAndFocusOnClip leads with a focusId cue', () => {
    const clip = flyAndFocusOnClip(id);

    expect(clip.start).toBe('live');
    expect(clip.timeline).toHaveLength(2);

    // First entry: immediate selection-focus cue carrying the FocusId.
    const focusCue = clip.timeline[0];
    expect(focusCue).not.toBeUndefined();
    expect(focusCue!.kind).toBe('focusId');
    if (focusCue!.kind === 'focusId') {
      expect(focusCue.id).toBe(id);
    }

    // Second entry: concurrent camera move + dolly.
    const allNode = clip.timeline[1];
    expect(allNode).not.toBeUndefined();
    expect(allNode!.kind).toBe('all');

    if (allNode!.kind === 'all') {
      expect(allNode.children).toHaveLength(2);

      const targetMove = allNode.children[0];
      expect(targetMove).not.toBeUndefined();
      expect(targetMove!.kind).toBe('moveTargetId');
      if (targetMove!.kind === 'moveTargetId') {
        expect(targetMove.id).toBe(id);
      }

      const dolly = allNode.children[1];
      expect(dolly).not.toBeUndefined();
      expect(dolly!.kind).toBe('dollyToId');
      if (dolly!.kind === 'dollyToId') {
        expect(dolly.id).toBe(id);
      }
    }
  });
});
