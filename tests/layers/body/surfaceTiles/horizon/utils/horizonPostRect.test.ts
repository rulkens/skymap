/**
 * The shader reads post (rect.xy + uv · rect.zw) · atlasSide / 2. A tile's 33 posts are
 * corner-inclusive, so its far edge must land on post 32 of its own slot: a slot-uv rect lands
 * on 33, the next slot's first post, and stretches every shadow by 1/32.
 */
import { describe, expect, it } from 'vitest';

import { horizonPostRect } from '../../../../../../src/layers/body/surfaceTiles/horizon/utils/horizonPostRect';
import {
  HORIZON_TILE_ATLAS_SIDE,
  HORIZON_TILE_PX,
} from '../../../../../../src/layers/body/surfaceTiles/format/data/surfaceTileParams';

const POSTS_PER_ROW = HORIZON_TILE_ATLAS_SIDE / 2;
const SLOT = HORIZON_TILE_PX / HORIZON_TILE_ATLAS_SIDE;

function postAt(rect: readonly number[], u: number, v: number): [number, number] {
  return [(rect[0]! + u * rect[2]!) * POSTS_PER_ROW, (rect[1]! + v * rect[3]!) * POSTS_PER_ROW];
}

describe('horizonPostRect', () => {
  it("maps a whole slot's uv 0…1 onto its posts 0…32", () => {
    const rect = horizonPostRect({
      atlasUvOrigin: [5 * SLOT, 2 * SLOT],
      atlasUvScale: [SLOT, SLOT],
    });
    const [x0, y0] = postAt(rect, 0, 0);
    const [x1, y1] = postAt(rect, 1, 1);
    expect(x0).toBeCloseTo(5 * 33);
    expect(y0).toBeCloseTo(2 * 33);
    expect(x1).toBeCloseTo(5 * 33 + 32);
    expect(y1).toBeCloseTo(2 * 33 + 32);
  });

  it("maps a child's quarter of an ancestor slot onto that quarter's posts", () => {
    // The south-east child (offset ½, ½) of the tile in slot 3: posts 16…32 of that slot.
    const rect = horizonPostRect({
      atlasUvOrigin: [3 * SLOT + SLOT / 2, SLOT / 2],
      atlasUvScale: [SLOT / 2, SLOT / 2],
    });
    expect(postAt(rect, 0, 0)[0]).toBeCloseTo(3 * 33 + 16);
    expect(postAt(rect, 1, 1)[0]).toBeCloseTo(3 * 33 + 32);
    expect(postAt(rect, 1, 1)[1]).toBeCloseTo(32);
  });
});
