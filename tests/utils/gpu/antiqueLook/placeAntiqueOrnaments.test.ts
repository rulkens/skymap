/**
 * placeAntiqueOrnaments — sky rows must land where the sky is drawn and stand
 * upright to celestial north; the regime split must hold each row to its side.
 */

import { describe, it, expect } from 'vitest';

import { placeAntiqueOrnaments } from '../../../../src/utils/gpu/antiqueLook/placeAntiqueOrnaments';
import type { AntiqueOrnament } from '../../../../src/@types/rendering/AntiqueOrnament';
import type { ViewBasis } from '../../../../src/@types/camera/projection/ViewBasis';
import { GAL_TO_EQ_MATRIX } from '../../../../src/data/superGalacticTransform';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { cross3 } from '../../../../src/utils/math/cross3';
import { normalize3 } from '../../../../src/utils/math/normalize3';

const ATLAS = { width: 100, height: 100, sprites: { beast: { x: 0, y: 0, w: 100, h: 50 } } };
const FRUSTUM = { tanLeft: -1.0264, tanRight: 1.0264, tanDown: -0.5774, tanUp: 0.5774 };
const SIZE = { width: 1600, height: 900 };
// Looking at RA 0, Dec 0 with north up: east (+y) is on the left, as on any sky chart.
const NORTH_UP: ViewBasis = { forward: [1, 0, 0], right: [0, -1, 0], up: [0, 0, 1] };
// The same view rolled so north points to screen left.
const NORTH_LEFT: ViewBasis = { forward: [1, 0, 0], right: [0, 0, -1], up: [0, -1, 0] };

// The galactic centre (l = 0, b = 0) in the equatorial world frame, and a view looking at it.
const GALACTIC_CENTRE = rotateVec3ByTightMat3(GAL_TO_EQ_MATRIX, [1, 0, 0], [0, 0, 0]);
const GALACTIC_CENTRE_AHEAD: ViewBasis = (() => {
  const f = GALACTIC_CENTRE;
  const right = normalize3(cross3(f, [0, 0, 1]));
  return { forward: f, right, up: cross3(right, f) };
})();

function skyRow(over: Partial<AntiqueOrnament> & { lonDeg?: number }): AntiqueOrnament {
  return {
    id: 'b',
    sprite: 'beast',
    anchor: { kind: 'sky', frame: 'equatorial', lonDeg: over.lonDeg ?? 0, latDeg: 0, sizeDeg: 30 },
    regime: 'always',
    facesNorth: true,
    rotationDeg: 0,
    pigment: 0,
    opacity: 1,
    clearsBeneath: false,
    mirrored: false,
    ...over,
  };
}

function place(rows: readonly AntiqueOrnament[], basis = NORTH_UP, camDistMpc = 0) {
  const camPosMpc = [camDistMpc, 0, 0] as [number, number, number];
  return placeAntiqueOrnaments({
    ornaments: rows,
    atlas: ATLAS,
    basis,
    frustum: FRUSTUM,
    size: SIZE,
    unitPx: 1,
    camPosMpc,
  });
}

describe('placeAntiqueOrnaments', () => {
  it('puts a sky row straight ahead at the canvas centre, upright, at its angular width', () => {
    const [placed] = place([skyRow({})]);
    expect(placed!.centrePx[0]).toBeCloseTo(800, 3);
    expect(placed!.centrePx[1]).toBeCloseTo(450, 3);
    expect(placed!.rotation).toBeCloseTo(0, 3);
    // 2·tan(15°) of a 2·0.5774-tan-tall 900 px frustum, half of it; the atlas rect is 2:1.
    expect(placed!.halfPx[0]).toBeCloseTo(
      0.5 * ((2 * Math.tan(Math.PI / 12) * 900) / (2 * 0.5774)),
      1,
    );
    expect(placed!.halfPx[1]).toBeCloseTo(placed!.halfPx[0] * 0.5, 3);
  });

  it('turns a row a quarter counter-clockwise when north points left', () => {
    const [placed] = place([skyRow({})], NORTH_LEFT);
    expect(placed!.rotation).toBeCloseTo(Math.PI / 2, 3);
  });

  it('places east of centre on the screen left, and nothing behind the camera', () => {
    const [east] = place([skyRow({ lonDeg: 20 })]);
    expect(east!.centrePx[0]).toBeLessThan(800);
    expect(place([skyRow({ lonDeg: 180 })])).toEqual([]);
  });

  it('keeps star-chart rows inside the Galaxy and Zone-of-Avoidance rows outside it', () => {
    const rows = [skyRow({ id: 's', regime: 'stars' }), skyRow({ id: 'c', regime: 'cosmos' })];
    expect(place(rows, NORTH_UP, 0).map((p) => p.opacity)).toEqual([1]);
    expect(place(rows, NORTH_UP, 5)).toHaveLength(1);
  });

  it('mirrors a globe-view figure by flipping its width, not its place', () => {
    const [plain] = place([skyRow({})]);
    const [mirrored] = place([skyRow({ mirrored: true })]);
    expect(mirrored!.halfPx[0]).toBeCloseTo(-plain!.halfPx[0], 6);
    expect(mirrored!.centrePx).toEqual(plain!.centrePx);
  });

  it('drops a sky figure that is mostly off the plate', () => {
    // Centred just past the right edge: well under the ~0.6 on-screen share it needs.
    const [edge] = place([skyRow({ lonDeg: -50 })]);
    expect(edge === undefined || edge.opacity < 0.5).toBe(true);
  });

  it('sizes a place in space by its distance from the eye, not from the Sun', () => {
    const atPlace = (camX: number) =>
      placeAntiqueOrnaments({
        ornaments: [
          skyRow({
            regime: 'always',
            facesNorth: false,
            anchor: { kind: 'space', lonDeg: 0, latDeg: 0, distMpc: 20, sizeMpc: 4 },
          }),
        ],
        atlas: ATLAS,
        basis: GALACTIC_CENTRE_AHEAD,
        frustum: FRUSTUM,
        size: SIZE,
        unitPx: 1,
        camPosMpc: GALACTIC_CENTRE.map((c) => c * camX) as [number, number, number],
      })[0]!;
    // Halfway to it, it should look about twice as wide and stay dead ahead.
    const far = atPlace(0);
    const near = atPlace(10);
    expect(near.halfPx[0] / far.halfPx[0]).toBeCloseTo(2, 1);
    expect(near.centrePx[0]).toBeCloseTo(far.centrePx[0], 3);
  });

  it('fades a sky row out while it is too small to read', () => {
    expect(
      place([
        skyRow({ anchor: { kind: 'sky', frame: 'equatorial', lonDeg: 0, latDeg: 0, sizeDeg: 3 } }),
      ]),
    ).toEqual([]);
  });
});
