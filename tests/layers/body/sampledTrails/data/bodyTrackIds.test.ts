import { describe, expect, it } from 'vitest';

import { BODY_TRACK_IDS } from '../../../../../src/layers/body/sampledTrails/data/bodyTrackIds';
import { BODY_SAMPLED_TRAIL_ROWS } from '../../../../../src/layers/body/sampledTrails/data/bodySampledTrailRows';
import { HORIZONS_BODIES } from '../../../../../tools/bodies/horizonsBodies';

// Each id is spelled in three places (body row, trail row, fetch row); a mismatch fails silently:
// the trail never draws, or the Layer fetches a track file the builder never writes.
describe('the body Layer sampled tracks', () => {
  it('draws a trail only for a body whose track it loads', () => {
    for (const { id } of BODY_SAMPLED_TRAIL_ROWS) expect(BODY_TRACK_IDS, id).toContain(id);
  });

  it('loads only tracks the builder writes', () => {
    const built = HORIZONS_BODIES.filter((b) => b.vectors === 'state').map((b) => b.id);
    for (const id of BODY_TRACK_IDS) expect(built, id).toContain(id);
  });
});
