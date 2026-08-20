import { describe, it, expect } from 'vitest';

import { earthTileIndicesForBounds } from '../../../../tools/utils/scene/earthTileIndicesForBounds';

// z=2, tilePx=512 -> 4 columns x 2 rows, lonStep=90, latStep=90: hand-checkable
// tile edges without leaning on earthTileColumns' own arithmetic.
const Z = 2;
const TILE_PX = 512;

describe('earthTileIndicesForBounds', () => {
  it('maps a box strictly inside one tile to that single tile', () => {
    // Tile (x=1, y=0) spans west=-90..0, north=90..0. A box well inside it.
    const rect = earthTileIndicesForBounds(
      { west: -80, east: -10, north: 80, south: 10 },
      Z,
      TILE_PX,
    );
    expect(rect).toEqual({ xMin: 1, xMax: 1, yMin: 0, yMax: 0 });
  });

  it('maps a box exactly spanning 2x2 tiles to those four', () => {
    const rect = earthTileIndicesForBounds(
      { west: -180, east: 0, north: 90, south: -90 },
      Z,
      TILE_PX,
    );
    expect(rect).toEqual({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
  });

  it('does not drag in the neighbour when an edge lands exactly on a tile boundary', () => {
    // west=-90 is the shared boundary between tile x=0 and tile x=1; the box
    // stays entirely inside x=1, so x=0 must not appear.
    const rect = earthTileIndicesForBounds(
      { west: -90, east: -10, north: 90, south: 0 },
      Z,
      TILE_PX,
    );
    expect(rect).toEqual({ xMin: 1, xMax: 1, yMin: 0, yMax: 0 });
  });

  it('drags in the neighbour when the box partially overlaps past the boundary', () => {
    // Same west edge as above, but east now reaches 10 degrees into tile x=2.
    const rect = earthTileIndicesForBounds(
      { west: -90, east: 10, north: 90, south: 0 },
      Z,
      TILE_PX,
    );
    expect(rect).toEqual({ xMin: 1, xMax: 2, yMin: 0, yMax: 0 });
  });

  it('maps the whole-globe box to the full grid', () => {
    const rect = earthTileIndicesForBounds(
      { west: -180, east: 180, north: 90, south: -90 },
      Z,
      TILE_PX,
    );
    expect(rect).toEqual({ xMin: 0, xMax: 3, yMin: 0, yMax: 1 });
  });
});
