import { describe, expect, it } from 'vitest';

import { pickStreamTracks } from '../../../../tools/streams/utils/pickStreamTracks';
import { galstreamsTrackFixture as track } from '../../../helpers/streams/galstreamsTrackFixture';

const skyOnly = (n = 61) => Array.from({ length: n }, () => 1);

describe('pickStreamTracks', () => {
  it('pickStreamTracks prefers the On track and skips sky-only, non-st and Sagittarius tracks', () => {
    const picked = pickStreamTracks([
      track({ name: 'GD-1', ref: 'off', on: false }),
      track({ name: 'GD-1', ref: 'on', on: true }),
      track({ name: 'Pal5', ref: 'sky', on: true, distanceKpc: skyOnly() }),
      track({ name: 'Pal5', ref: 'real', on: false }),
      track({ name: 'Acheron', ref: 'ep', kind: 'ep' }),
      track({ name: 'Sagittarius', ref: 'a20' }),
    ]);
    expect(picked.map((t) => `${t.name}/${t.ref}`)).toEqual(['GD-1/on', 'Pal5/real']);
  });
});
