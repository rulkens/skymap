/**
 * flyAndFocusOnClip tests — verify the establishing-move clip is a live-start
 * wrapper over the `focusOnId` composite: a focusId selection cue followed by
 * the concurrent camera move, in one seq.
 *
 * Cue kinds come from effectHelpers constructors:
 *   - `focusOnId(id, over)` → `seq([focusId, all([moveTargetId, dollyToId])])`
 *   - `focus(id)`         → `{ kind: 'focusId', id }`
 *   - `moveTargetId`      → `{ kind: 'moveTargetId', id, over, ease }`
 *   - `dollyToId`         → `{ kind: 'dollyToId',    id, over, ease }`
 */

import { describe, it, expect } from 'vitest';
import { flyAndFocusOnClip } from '../../../src/state/tour/flyAndFocusOnClip';
import { focusOnId } from '../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../src/utils/animation/focusId';

const id = focusId('m87');

describe('flyAndFocusOnClip', () => {
  it('wraps the focusOnId composite in a live-start clip', () => {
    const clip = flyAndFocusOnClip(id);

    expect(clip.start).toBe('live');
    expect(clip.timeline).toHaveLength(1);
    // Identical composition to the primitive at the same 5 s duration — the
    // builder adds nothing but the ClipData shell.
    expect(clip.timeline[0]).toEqual(focusOnId(id, 5));
  });
});
