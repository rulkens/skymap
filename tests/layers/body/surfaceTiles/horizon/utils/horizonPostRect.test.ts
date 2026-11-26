/**
 * The shader reads post (rect.xy + uv · rect.zw) · atlasSide / 2. A tile's 129 posts are
 * corner-inclusive, so its far edge must land on post 128 of its own slot: a slot-uv rect lands
 * on 129, the next slot's first post, and stretches every shadow by 1/128.
 */
import { describe, expect, it } from 'vitest';

import { HORIZON_POSTS_PER_TILE } from '../../../../../../src/layers/body/surfaceTiles/horizon/data/horizonAngleMap';
import { horizonPostRect } from '../../../../../../src/layers/body/surfaceTiles/horizon/utils/horizonPostRect';
import {
  HORIZON_TILE_ATLAS_SIDE,
  HORIZON_TILE_PX,
} from '../../../../../../src/layers/body/surfaceTiles/format/data/surfaceTileParams';

const POSTS_PER_ROW = HORIZON_TILE_ATLAS_SIDE / 2;
const SLOT = HORIZON_TILE_PX / HORIZON_TILE_ATLAS_SIDE;
const POSTS = HORIZON_POSTS_PER_TILE;
const LAST = POSTS - 1;

function postAt(rect: readonly number[], u: number, v: number): [number, number] {
  return [(rect[0]! + u * rect[2]!) * POSTS_PER_ROW, (rect[1]! + v * rect[3]!) * POSTS_PER_ROW];
}

describe('horizonPostRect', () => {
  it("maps a whole slot's uv 0…1 onto its posts 0…128", () => {
    const rect = horizonPostRect({
      atlasUvOrigin: [5 * SLOT, 2 * SLOT],
      atlasUvScale: [SLOT, SLOT],
    });
    const [x0, y0] = postAt(rect, 0, 0);
    const [x1, y1] = postAt(rect, 1, 1);
    expect(x0).toBeCloseTo(5 * POSTS);
    expect(y0).toBeCloseTo(2 * POSTS);
    expect(x1).toBeCloseTo(5 * POSTS + LAST);
    expect(y1).toBeCloseTo(2 * POSTS + LAST);
  });

  it("maps a child's quarter of an ancestor slot onto that quarter's posts", () => {
    // The south-east child (offset ½, ½) of the tile in slot 3: posts 64…128 of that slot.
    const rect = horizonPostRect({
      atlasUvOrigin: [3 * SLOT + SLOT / 2, SLOT / 2],
      atlasUvScale: [SLOT / 2, SLOT / 2],
    });
    expect(postAt(rect, 0, 0)[0]).toBeCloseTo(3 * POSTS + LAST / 2);
    expect(postAt(rect, 1, 1)[0]).toBeCloseTo(3 * POSTS + LAST);
    expect(postAt(rect, 1, 1)[1]).toBeCloseTo(LAST);
  });
});
