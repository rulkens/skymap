import { describe, it, expect } from 'vitest';

import { parseCameraControls } from '../../../src/utils/storage/parseCameraControls';
import { DEFAULT_CAMERA_CONTROLS } from '../../../src/data/camera/openSpaceNavigation';

describe('parseCameraControls', () => {
  it('round-trips the default', () => {
    expect(parseCameraControls(JSON.stringify(DEFAULT_CAMERA_CONTROLS))).toEqual(
      DEFAULT_CAMERA_CONTROLS,
    );
  });

  it('falls back on a malformed field alone', () => {
    const raw = JSON.stringify({
      scheme: 'nope',
      friction: 0.2,
      frictionOn: { rotational: false, zoom: 'x', roll: true },
    });

    expect(parseCameraControls(raw)).toEqual({
      scheme: 'skymap',
      friction: 0.2,
      frictionOn: { rotational: false, zoom: true, roll: true },
    });
  });

  it('rejects an out-of-range friction', () => {
    expect(parseCameraControls('{"scheme":"openspace","friction":7}')).toMatchObject({
      scheme: 'openspace',
      friction: DEFAULT_CAMERA_CONTROLS.friction,
    });
  });

  it.each(['42', 'null', '[]', '{not json'])('parses %s to null', (raw) => {
    expect(parseCameraControls(raw)).toBeNull();
  });
});
