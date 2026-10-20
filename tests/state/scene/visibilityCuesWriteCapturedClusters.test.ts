/**
 * A visibility cue writes intent into settings; a cluster outside the snapshot would stay
 * changed after a tour restores. Every entry's cluster is a cue's possible write target.
 */

import { describe, it, expect } from 'vitest';
import { APP_VISIBILITY } from '../../../src/compositions/appVisibility';
import { captureSettings } from '../../../src/state/scene/captureSettings';
import { visibilityClusterOf } from '../../../src/utils/visibility/visibilityClusterOf';
import { makeSettingsFixture } from '../settings/makeSettingsFixture';

const captured = Object.keys(captureSettings({ settings: makeSettingsFixture() }));

describe('visibility cues', () => {
  it.each(APP_VISIBILITY.map(visibilityClusterOf))(
    "every entry's cluster is captured by the tour snapshot (%s)",
    (cluster) => {
      expect(captured).toContain(cluster);
    },
  );
});
