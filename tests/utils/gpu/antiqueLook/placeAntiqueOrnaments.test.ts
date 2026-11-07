/**
 * placeAntiqueOrnaments — sky rows must land where the sky is drawn and stand
 * upright to celestial north; the regime split must hold each row to its side.
 */

import { describe, it, expect } from 'vitest';

import { placeAntiqueOrnaments } from '../../../../src/utils/gpu/antiqueLook/placeAntiqueOrnaments';
import type { AntiqueOrnament } from '../../../../src/@types/rendering/AntiqueOrnament';
import type { ViewBasis } from '../../../../src/@types/camera/projection/ViewBasis';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { GAL_TO_EQ_MATRIX } from '../../../../src/data/superGalacticTransform';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { cross3 } from '../../../../src/utils/math/cross3';
import { normalize3 } from '../../../../src/utils/math/normalize3';

const ATLAS = {
  width: 100,
  height: 100,
  sprites: { beast: { x: 0, y: 0, w: 100, h: 50 }, cartouche: { x: 0, y: 50, w: 50, h: 50 } },
  cartoucheOval: { cx: 0.5, cy: 0.6, rx: 0.3, ry: 0.25 },
};
const FRUSTUM = { tanLeft: -1.0264, tanRight: 1.0264, tanDown: -0.5774, tanUp: 0.5774 };
const SIZE = { width: 1600, height: 900 };
// Looking at RA 0, Dec 0 with north up: east (+y) is on the left, as on any sky chart.
const NORTH_UP: ViewBasis = { forward: [1, 0, 0], right: [0, -1, 0], up: [0, 0, 1] };
// The same view rolled so north points to screen left.
const NORTH_LEFT: ViewBasis = { forward: [1, 0, 0], right: [0, 0, -1], up: [0, -1, 0] };

// The galactic centre (l = 0, b = 0) in the equatorial world frame, and a view
// turned 30° off it, so a place there lands off the subject at the plate's centre.
const GALACTIC_CENTRE = rotateVec3ByTightMat3(GAL_TO_EQ_MATRIX, [1, 0, 0], [0, 0, 0]);
const GALACTIC_CENTRE_ASIDE: ViewBasis = (() => {
  const g = GALACTIC_CENTRE;
  const side = normalize3(cross3(g, [0, 0, 1]));
  const t = (30 * Math.PI) / 180;
  const f = normalize3(g.map((c, i) => c * Math.cos(t) + side[i]! * Math.sin(t)) as Vec3);
  const right = normalize3(cross3(f, [0, 0, 1]));
  return { forward: f, right, up: cross3(right, f) };
})();

function skyRow(over: Partial<AntiqueOrnament> & { lonDeg?: number }): AntiqueOrnament {
  return {
    sprite: 'beast',
    anchor: { kind: 'sky', lonDeg: over.lonDeg ?? 0, latDeg: 0, sizeDeg: 30 },
    regime: 'always',
    facesNorth: true,
    pigment: 0,
    opacity: 1,
    clearsBeneath: false,
    mirrored: false,
    ...over,
  };
}

function place(
  rows: readonly AntiqueOrnament[],
  basis = NORTH_UP,
  camDistMpc = 0,
  chromeHidden = false,
  title: { rect: readonly [number, number, number, number]; weight: number } | null = null,
  covers: readonly { x0: number; y0: number; x1: number; y1: number }[] = [],
) {
  const camPosMpc = [camDistMpc, 0, 0] as [number, number, number];
  return placeAntiqueOrnaments({
    ornaments: rows,
    atlas: ATLAS,
    basis,
    frustum: FRUSTUM,
    size: SIZE,
    unitPx: 1,
    camPosMpc,
    chromeHidden,
    covers,
    title,
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
    const rows = [skyRow({ regime: 'stars' }), skyRow({ regime: 'cosmos' })];
    expect(place(rows, NORTH_UP, 0).map((p) => p.opacity)).toEqual([1]);
    expect(place(rows, NORTH_UP, 5)).toHaveLength(1);
  });

  it('mirrors a globe-view figure by flipping its width, not its place', () => {
    const [plain] = place([skyRow({})]);
    const [mirrored] = place([skyRow({ mirrored: true })]);
    expect(mirrored!.halfPx[0]).toBeCloseTo(-plain!.halfPx[0], 6);
    expect(mirrored!.centrePx).toEqual(plain!.centrePx);
  });

  it('withdraws a sheet-anchored title when the UI is hidden, keeping the sky figures', () => {
    const title = skyRow({
      anchor: { kind: 'sheet', corner: 'topLeft', insetUnits: [100, 100], sizeUnits: 100 },
      facesNorth: false,
    });
    expect(place([title, skyRow({})], NORTH_UP, 0, false)).toHaveLength(2);
    expect(place([title, skyRow({})], NORTH_UP, 0, true)).toHaveLength(1);
  });

  it("sets the plate's title from the lettering sheet in the cartouche's interior, at its strength", () => {
    const cartouche = skyRow({
      sprite: 'cartouche',
      anchor: { kind: 'sheet', corner: 'topLeft', insetUnits: [200, 200], sizeUnits: 100 },
      facesNorth: false,
      clearsBeneath: true,
    });
    const rect = [0.1, 0.2, 0.3, 0.4] as const;
    const [frame, title] = place([cartouche], NORTH_UP, 0, false, { rect, weight: 0.4 });
    expect(frame!.lettering).toBe(false);
    expect(title).toMatchObject({ lettering: true, opacity: 0.4, rect: [...rect], rotation: 0 });
    // The interior's centre sits 0.1 of the sprite's height below its middle.
    expect(title!.centrePx[0]).toBeCloseTo(frame!.centrePx[0]);
    expect(title!.centrePx[1]).toBeCloseTo(frame!.centrePx[1] + 0.1 * 2 * frame!.halfPx[1]);
    expect(title!.halfPx[0]).toBeCloseTo(0.3 * 2 * frame!.halfPx[0]);
    expect(title!.halfPx[1]).toBeCloseTo(0.25 * 2 * frame!.halfPx[1]);
    expect(place([cartouche], NORTH_UP, 0, false, null)).toHaveLength(1);
  });

  it('moves the cartouche off an open panel, and its title with it', () => {
    const cartouche = skyRow({
      sprite: 'cartouche',
      anchor: { kind: 'sheet', corner: 'topLeft', insetUnits: [200, 200], sizeUnits: 100 },
      facesNorth: false,
      clearsBeneath: true,
    });
    const panel = { x0: 0, y0: 0, x1: 400, y1: 400 };
    const title = { rect: [0, 0, 1, 1] as const, weight: 1 };
    const [frame, set] = place([cartouche], NORTH_UP, 0, false, title, [panel]);
    expect(frame!.centrePx[0]).toBeGreaterThan(SIZE.width / 2);
    expect(set!.centrePx[0]).toBeCloseTo(frame!.centrePx[0]);
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
        basis: GALACTIC_CENTRE_ASIDE,
        frustum: FRUSTUM,
        size: SIZE,
        unitPx: 1,
        chromeHidden: false,
        covers: [],
        title: null,
        camPosMpc: GALACTIC_CENTRE.map((c) => c * camX) as [number, number, number],
      })[0]!;
    // Halfway to it, it should look about twice as wide and stay where it was.
    const far = atPlace(0);
    const near = atPlace(10);
    expect(near.halfPx[0] / far.halfPx[0]).toBeCloseTo(2, 1);
    expect(near.centrePx[0]).toBeCloseTo(far.centrePx[0], 3);
  });

  it('sails a sea beast whole inside the numbered border or not at all', () => {
    const beastWithUnit = (unitPx: number) =>
      placeAntiqueOrnaments({
        ornaments: [
          skyRow({
            facesNorth: false,
            anchor: { kind: 'space', lonDeg: 0, latDeg: 0, distMpc: 20, sizeMpc: 4 },
          }),
        ],
        atlas: ATLAS,
        basis: GALACTIC_CENTRE_ASIDE,
        frustum: FRUSTUM,
        size: SIZE,
        unitPx,
        chromeHidden: false,
        covers: [],
        title: null,
        camPosMpc: [0, 0, 0],
      });
    // The border is 50 print units deep: at 8 px a unit it reaches 400 px in,
    // past the same beast's outer edge (~260 px from the canvas side), where a
    // constellation figure may be cropped but a beast may not.
    expect(beastWithUnit(1)).toHaveLength(1);
    expect(beastWithUnit(8)).toEqual([]);
  });

  it('keeps a sea beast off the subject at the plate centre', () => {
    const beast = skyRow({
      facesNorth: false,
      anchor: { kind: 'space', lonDeg: 0, latDeg: 0, distMpc: 20, sizeMpc: 4 },
    });
    const at = (basis: ViewBasis) =>
      placeAntiqueOrnaments({
        ornaments: [beast],
        atlas: ATLAS,
        basis,
        frustum: FRUSTUM,
        size: SIZE,
        unitPx: 1,
        chromeHidden: false,
        covers: [],
        title: null,
        camPosMpc: [0, 0, 0],
      });
    const ahead: ViewBasis = (() => {
      const f = GALACTIC_CENTRE;
      const right = normalize3(cross3(f, [0, 0, 1]));
      return { forward: f, right, up: cross3(right, f) };
    })();
    expect(at(GALACTIC_CENTRE_ASIDE)).toHaveLength(1);
    expect(at(ahead)).toEqual([]);
  });

  it('withdraws a sky figure that would run under a clearing sheet ornament', () => {
    const cartouche: AntiqueOrnament = {
      ...skyRow({ facesNorth: false, clearsBeneath: true }),
      anchor: { kind: 'sheet', corner: 'topLeft', insetUnits: [800, 450], sizeUnits: 300 },
    };
    // Straight ahead, the figure lands on the cartouche placed at the canvas centre.
    expect(place([cartouche, skyRow({})])).toHaveLength(1);
    expect(place([skyRow({})])).toHaveLength(1);
  });

  it('fades a sky row out while it is too small to read', () => {
    expect(place([skyRow({ anchor: { kind: 'sky', lonDeg: 0, latDeg: 0, sizeDeg: 3 } })])).toEqual(
      [],
    );
  });
});
