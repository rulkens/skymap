/**
 * surfaceTilePointAt's uv is what a mesh body hands `horizonVisibility` in place of the
 * surface-tile fragment's interpolated `in.uv` (`vertex.wesl`: east fraction, 1 − north
 * fraction). The oracle is the patch geometry itself: the tile's `surfacePatchAnchor`, built
 * as `cutSurfaceTiles` builds it, must put the vertex at that uv on the site. A v running north,
 * or a longitude unwrapped against the prime-meridian offset, lands the lookup on another post.
 */
import { describe, expect, it } from 'vitest';

import { surfaceTilePointAt } from '../../../../../../src/layers/body/surfaceTiles/format/utils/surfaceTilePointAt';
import { surfaceTileColumns } from '../../../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileColumns';
import { surfacePatchAnchor } from '../../../../../../src/layers/body/surfaceTiles/patch/subsystems/surfacePatchAnchor';
import { SURFACE_TILE_PX } from '../../../../../../src/layers/body/surfaceTiles/format/data/surfaceTileParams';
import { lonLatDegToDirection } from '../../../../../../src/utils/geo/lonLatDegToDirection';

const Z = 17;

describe('surfaceTilePointAt', () => {
  it.each([
    ['Perseverance, east of the prime meridian', 77.23205, 18.43687],
    ['Opportunity, written as 354.6° east', 354.619, -2.336],
  ])('puts the patch vertex at its uv on %s', (_, lonDeg, latDeg) => {
    const site = lonLatDegToDirection({ lonDeg, latDeg });
    const { x, y, uv } = surfaceTilePointAt(site, Z, SURFACE_TILE_PX)!;

    const cols = surfaceTileColumns(Z, SURFACE_TILE_PX);
    const rows = cols / 2;
    const anchor = surfacePatchAnchor(x / cols, 1 - (y + 1) / rows, (x + 1) / cols, 1 - y / rows);
    const lon = anchor.lon0Rad + uv[0] * anchor.dLonRad;
    const lat = anchor.lat0Rad + (1 - uv[1]) * anchor.dLatRad;
    const vertex = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];

    vertex.forEach((component, i) => expect(component).toBeCloseTo(site[i]!, 9));
  });
});
