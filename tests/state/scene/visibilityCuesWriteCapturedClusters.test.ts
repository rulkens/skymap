/**
 * A visibility cue writes intent into settings; a cluster outside the
 * snapshot would stay changed after a tour restores. The Layer half of the
 * snapshot is derived, but the core list is still hand-kept, so pin it here.
 */

import { describe, it, expect } from 'vitest';
import { VISIBILITY_ACTION_ROW } from '../../../src/services/animation/visibilityActionRow';
import { captureSettings } from '../../../src/state/scene/captureSettings';
import { makeSettingsFixture } from '../settings/makeSettingsFixture';
import type { VisibilityLayerKey } from '../../../src/@types/animation/VisibilityLayerKey';

const settings = makeSettingsFixture();
const captured = Object.keys(captureSettings({ settings }));
const keys = Object.keys(VISIBILITY_ACTION_ROW) as VisibilityLayerKey[];

describe('visibility cues', () => {
  it.each(keys)('%s writes only captured clusters', (key) => {
    const { actions } = VISIBILITY_ACTION_ROW[key];
    for (const action of [...actions(true, settings), ...actions(false, settings)]) {
      const cluster = /^settings\/([^/]+)\//.exec(action.type)?.[1];
      expect(cluster, action.type).toBeDefined();
      expect(captured, action.type).toContain(cluster);
    }
  });
});
