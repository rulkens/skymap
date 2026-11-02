import { describe, expect, it } from 'vitest';

import { APP_VISIBILITY_REGISTRY } from '../../src/compositions/appVisibility';
import { bandValueOf } from '../../src/services/engine/presentation/bandValueOf';
import { MILKY_WAY_RADIUS_MPC } from '../../src/data/milkyWay/milkyWayRadiusMpc';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../src/data/rendering/foregroundMaxDistance';
import { SCALE_UNITS } from '../../src/data/scaleUnits';
import { cosmicFlows } from '../../src/compositions/exhibits/cosmicFlows';
import { observableUniverse } from '../../src/layers/cosmicHorizon/exhibits/observableUniverse';
import { THE_EDGE_MPC } from '../../src/data/animation/tours/grandTour/theEdge';
import { deriveBodyStates } from '../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../src/data/time/constJ2000';
import { GALACTIC_CENTRE_ANCHOR } from '../../src/data/places/galacticCentre';
import { STAR_CATALOG_IDS } from '../../src/data/starCatalog/starCatalogIds';
import { SEEDED_STAR_CATALOGS } from '../../src/data/bodies/seededStarCatalogs';
import { STAR_BACKDROP_DISSOLVE } from '../../src/layers/starCatalog/data/starBackdropDissolve';
import { FAMOUS_STAR_ENTRY } from '../../src/layers/starCatalog/sources/famous-star';
import { SUN_ENTRY } from '../../src/layers/starCatalog/sources/sun';
import { S_STAR_ENTRY } from '../../src/layers/starCatalog/sources/s-star';
import { normalize3 } from '../../src/utils/math/normalize3';
import { SCENE_EARTH } from '../../src/data/bodies/sceneEarth';
import { asSceneBodyId } from '../../src/utils/scene/asSceneBodyId';
import { visibilityEntryOf } from '../../src/utils/visibility/visibilityEntryOf';
import { fadeBand } from '../../src/utils/math/fadeBand';
import { regionById } from '../../src/utils/regions/regionById';
import type { Vec3 } from '../../src/@types/math/Vec3';
import type { FadeBand } from '../../src/@types/math/FadeBand';
import type { VisibilityAddress } from '../../src/@types/animation/VisibilityAddress';

const BODY_STATES = deriveBodyStates(CONST_J2000);

function valueAtEye(key: string, eye: Readonly<Vec3>, item?: string): number {
  const entry = APP_VISIBILITY_REGISTRY.find((e) => 'key' in e && e.key === key)!;
  return bandValueOf(entry, item, { drawCamPos: eye, snapshot: { bodyStates: BODY_STATES } });
}

function valueAt(key: string, distanceMpc: number, item?: string): number {
  return valueAtEye(key, [distanceMpc, 0, 0], item);
}

// Pins what only a band's `items` scoping can do; the edges themselves are data, not tested.
describe('band items scoping', () => {
  it('survey: gone at deep zoom for survey catalogs, famous exempt', () => {
    expect(valueAt('survey', 0.002, 'sdss')).toBe(0);
    expect(valueAt('survey', 0.5, 'sdss')).toBe(1);
    expect(valueAt('survey', 0.002, 'famousGalaxy')).toBe(1);
  });

  it('structure rings: cosmic yields at deep zoom, Milky Way places recede to the foreground gate', () => {
    expect(valueAt('structureRing', 0.002, 'galaxy-cluster')).toBe(0);
    expect(valueAt('structureRing', 0.5, 'galaxy-cluster')).toBe(1);
    expect(valueAt('structureRing', 0.002, 'nebula')).toBe(1);
    expect(valueAt('structureRing', MILKY_WAY_RADIUS_MPC * 2, 'nebula')).toBe(1);
    expect(valueAt('structureRing', FOREGROUND_MAX_DISTANCE_MPC, 'nebula')).toBe(0);
    expect(valueAt('structureRing', FOREGROUND_MAX_DISTANCE_MPC, 'galaxy-cluster')).toBe(1);
  });
});

// Pins that the near-field Layer rows yield at the foreground gate, where core skips their
// passes: a band dropped from any of these entries draws a NEAR0 pass at galaxy zoom again.
describe('near-field entries at the foreground gate', () => {
  it.each(['sStarTrails', 'missionTrails', 'orbitTrails'])(
    '%s is full inside the gate and gone at it',
    (key) => {
      expect(valueAt(key, FOREGROUND_MAX_DISTANCE_MPC / 4)).toBe(1);
      expect(valueAt(key, FOREGROUND_MAX_DISTANCE_MPC)).toBe(0);
    },
  );
});

// Pins each seeded star set's backdrop dissolve to its own region's anchor. The eyes sit on
// the home → galactic centre line, 8.2 kpc apart, so measuring from the other region's anchor
// fails every check: below 1 where full is expected, above 0 where gone is.
describe('seeded star sets dissolve from their own region', () => {
  const [, goneAt] = STAR_BACKDROP_DISSOLVE.out;
  const gc = BODY_STATES.get(GALACTIC_CENTRE_ANCHOR.id)!.positionMpc;
  const towardGc = normalize3([gc[0], gc[1], gc[2]]);
  const along = (from: Readonly<Vec3>, distanceMpc: number): Vec3 => [
    from[0] + towardGc[0] * distanceMpc,
    from[1] + towardGc[1] * distanceMpc,
    from[2] + towardGc[2] * distanceMpc,
  ];

  it.each([FAMOUS_STAR_ENTRY.id, SUN_ENTRY.id])(
    'seeded neighbourhood stars (%s) are full at 1 kpc from home and gone at the far edge of the backdrop',
    (item) => {
      expect(valueAtEye('starCatalog', along([0, 0, 0], SCALE_UNITS.KPC_TO_MPC), item)).toBe(1);
      expect(valueAtEye('starCatalog', along([0, 0, 0], goneAt), item)).toBe(0);
    },
  );

  it('S-stars are full at 1 pc from the galactic centre and gone at the far edge of the backdrop from it', () => {
    expect(valueAtEye('starCatalog', along(gc, SCALE_UNITS.PC_TO_MPC), S_STAR_ENTRY.id)).toBe(1);
    expect(valueAtEye('starCatalog', along(gc, -goneAt), S_STAR_ENTRY.id)).toBe(0);
  });

  it.each(STAR_CATALOG_IDS.filter((id) => !(id in SEEDED_STAR_CATALOGS)))(
    'the survey star item (%s) is unbanded',
    (item) => {
      expect(valueAt('starCatalog', 10 * FOREGROUND_MAX_DISTANCE_MPC, item)).toBe(1);
    },
  );
});

// One astronomical unit from the Sun: the home view's distance from the render origin.
const HOME_DISTANCE_MPC = SCALE_UNITS.AU_TO_MPC;

// Pins that the extragalactic overlays cannot draw over the home view: a band removed
// from either entry puts filaments or flow ribbons in front of Earth again.
describe('extragalactic overlays at the home view', () => {
  it.each(['flow', 'cosmicWebFilaments'])('%s is gone at home and full in the survey', (key) => {
    expect(valueAt(key, HOME_DISTANCE_MPC)).toBe(0);
    expect(valueAt(key, 1)).toBe(1);
  });
});

// Pins that the Cosmic Flows exhibit opens on full ribbons: its pose is the only view that
// shows them this close, so a flow band edge pushed past it dims the exhibit with no other test failing.
describe('flow at the Cosmic Flows exhibit pose', () => {
  it('is full at the nearest the exhibit eye can sit to home', () => {
    const { target, distance } = cosmicFlows.pose!;
    expect(valueAt('flow', distance - Math.hypot(...target))).toBe(1);
  });
});

// Pins the satellites band to the live Earth position, read 100 days past J2000.
describe('satellites near Earth', () => {
  it('are full at 300 000 km and gone at 600 000 km from the live Earth', () => {
    const states = deriveBodyStates(CONST_J2000 + 100);
    const earth = states.get(SCENE_EARTH.id)!.positionMpc;
    const at = (km: number): number => {
      const entry = APP_VISIBILITY_REGISTRY.find((e) => 'key' in e && e.key === 'satellites')!;
      const eye: Vec3 = [earth[0] + km * SCALE_UNITS.KM_TO_MPC, earth[1], earth[2]];
      return bandValueOf(entry, 'active', { drawCamPos: eye, snapshot: { bodyStates: states } });
    };
    expect(at(300_000)).toBe(1);
    expect(at(450_000)).toBeGreaterThan(0);
    expect(at(450_000)).toBeLessThan(1);
    expect(at(600_000)).toBe(0);
  });
});

// Pins each caption's entry band to the curve it faded by when core applied it per caption
// kind, edges restated from their sources. The eye backs off along the home → galactic centre
// line, so a band measured from the wrong anchor reads a different value mid-band.
describe('caption bands', () => {
  const gc = BODY_STATES.get(GALACTIC_CENTRE_ANCHOR.id)!.positionMpc;
  const sun = BODY_STATES.get(asSceneBodyId('sun'))!.positionMpc;
  const towardGc = normalize3([gc[0] - sun[0], gc[1] - sun[1], gc[2] - sun[2]]);
  // The caption entry's OWN band: a label with `of` also multiplies its thing's bands (the
  // star map's backdrop), which `viewBandOf`'s tests pin.
  const captionValue = (label: string, item: string, from: Readonly<Vec3>, d: number): number =>
    bandValueOf(
      visibilityEntryOf(APP_VISIBILITY_REGISTRY, `label:${label}` as VisibilityAddress),
      item,
      {
        drawCamPos: [
          from[0] - towardGc[0] * d,
          from[1] - towardGc[1] * d,
          from[2] - towardGc[2] * d,
        ],
        snapshot: { bodyStates: BODY_STATES },
      },
    );
  const beforeMidAfter = ({ fullAt, goneAt }: FadeBand): number[] => [
    fullAt * 0.9,
    (fullAt + goneAt) / 2,
    goneAt * 1.1,
  ];

  // Four neighbourhood extents, the solar-system captions' reach; full at half of it.
  const reachMpc = regionById('solar-neighbourhood').extentMpc * 4;
  const solarSystem: FadeBand = { fullAt: reachMpc / 2, goneAt: reachMpc };

  it.each([
    ['starCatalog', SUN_ENTRY.id],
    ['body', 'earth'],
    ['body', 'planet'],
    ['missions', 'craft'],
  ])('label:%s %s fades out over the solar-system reach, measured from the Sun', (label, item) => {
    for (const d of beforeMidAfter(solarSystem)) {
      expect(captionValue(label, item, sun, d)).toBeCloseTo(fadeBand(solarSystem, d), 12);
    }
  });

  it('the Sun band leaves the star map item alone', () => {
    expect(captionValue('starCatalog', 'famousStar', sun, reachMpc)).toBe(1);
  });

  it('label:blackHole fades out a disc diameter past R₀, measured from Sgr A*', () => {
    const sgrAStar: FadeBand = {
      fullAt: Math.hypot(...GALACTIC_CENTRE_ANCHOR.positionMpc),
      goneAt: MILKY_WAY_RADIUS_MPC * 2,
    };
    for (const d of beforeMidAfter(sgrAStar)) {
      expect(captionValue('blackHole', 'sgr-a-star', gc, -d)).toBeCloseTo(
        fadeBand(sgrAStar, d),
        12,
      );
    }
  });
});

// Pins that the shell is absent in the galaxy survey and full where its two showpieces
// sit: a band edge moved past either pose blanks the exhibit or the tour's edge beat.
describe('cosmic horizon reach', () => {
  it('is gone at survey range and full at the exhibit and the tour edge', () => {
    expect(valueAt('cosmicHorizon', 5)).toBe(0);
    expect(valueAt('cosmicHorizon', observableUniverse.pose!.distance)).toBe(1);
    expect(valueAt('cosmicHorizon', THE_EDGE_MPC)).toBe(1);
  });
});
