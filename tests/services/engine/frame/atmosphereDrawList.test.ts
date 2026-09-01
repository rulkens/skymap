/**
 * atmosphereDrawList — unit tests for the ONE per-frame atmosphere draw-list
 * derivation that both the sky-view bake and the shell draw consume.
 *
 * The list is the three-part predicate applied to `[earth, ...planets]`: a body
 * survives iff it has an `ATMOSPHERE_PARAMS` row (the data-gate), the camera is
 * inside the shared near-field distance edge (`FOREGROUND_MAX_DISTANCE_MPC`), and
 * its SURFACE disc resolves at/above `SUB_PIXEL_BODY_CULL_PX`. Each test below is
 * an independent reason the list could be wrong — one per branch — so a
 * regression in any single gate lands as a distinct failure rather than hiding
 * behind the others.
 */

import { describe, it, expect, vi } from 'vitest';

import { atmosphereDrawList } from '../../../../src/services/engine/frame/atmosphereDrawList';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { ATMOSPHERE_PARAMS } from '../../../../src/data/bodies/atmosphereParams';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/foregroundMaxDistance';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EarthBody } from '../../../../src/@types/scene/EarthBody';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

// The derivation resolves each body's live position/orientation from the per-frame
// body-state snapshot (keyed by id). Stub it to a map built from the SeededBody
// fixtures, REUSING each fixture's own positionMpc/orientation refs — so the list
// resolves the exact fixture values (identity-equal), keeping the assertions below
// intact while the reads move off the baked record fields.
vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn((state: EngineState): ReadonlyMap<string, BodyState> => {
    const m = new Map<string, BodyState>();
    for (const b of (state.data.bodies.planets ?? []) as readonly SeededPlanet[]) {
      m.set(b.id, { positionMpc: b.positionMpc, orientation: b.orientation, meanAnomalyRad: 0 });
    }
    const earth = state.data.bodies.earth as SeededEarth | null;
    if (earth)
      m.set(earth.id, {
        positionMpc: earth.positionMpc,
        orientation: earth.orientation,
        meanAnomalyRad: 0,
      });
    return m;
  }),
}));

// Test fixtures pairing the identity records with the J2000 state the snapshot
// carries — position + orientation were lifted off the record onto the derive, so
// the fixtures supply them here (Earth's sourced from the derive so the values are
// the real J2000 ones; refs stay stable across the mock + the assertions).
type SeededEarth = EarthBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
type SeededPlanet = PlanetBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
const EARTH_STATE = deriveBodyStates(CONST_J2000).get('earth')!;
const SEEDED_EARTH: SeededEarth = {
  ...SCENE_EARTH,
  positionMpc: EARTH_STATE.positionMpc,
  orientation: EARTH_STATE.orientation,
};

/**
 * The minimal EngineState the derivation reads: the seeded Earth + planet list
 * off `data.bodies`. Nothing else on `state` is touched.
 */
function makeState(init: {
  earth?: EarthBody | null;
  planets?: readonly PlanetBody[];
}): EngineState {
  return {
    data: {
      bodies: {
        earth: 'earth' in init ? (init.earth ?? null) : SEEDED_EARTH,
        planets: init.planets ?? [],
      },
    },
  } as unknown as EngineState;
}

/**
 * The minimal ReadyFrameContext the derivation reads: `drawCamPos` (per-body
 * sub-pixel distance source), `cam.distance` (the whole-list near-field cull),
 * and `canvasSize`/`fovYRad` (the sub-pixel projection). `camDistance` defaults
 * to 0 — inside the near-field edge, the common body-framed path.
 */
function makeCtx(drawCamPos: Vec3, camDistance = 0): ReadyFrameContext {
  return {
    drawCamPos,
    cam: { distance: camDistance },
    canvasSize: { width: 1920, height: 1080 },
    fovYRad: 1.0,
  } as unknown as ReadyFrameContext;
}

/** A camera pose `radii` Earth-radii out from `body` along +x — sets the disc size. */
function camRadiiOut(body: { positionMpc: Vec3; radiusM: number }, radii: number): Vec3 {
  return [
    body.positionMpc[0] + radii * body.radiusM * SCALE_UNITS.M_TO_MPC,
    body.positionMpc[1],
    body.positionMpc[2],
  ];
}

/** A body with no ATMOSPHERE_PARAMS row today — a synthetic id absent from the table. */
const NO_ROW_PLANET: SeededPlanet = {
  id: 'atmosphereless-test-body',
  label: 'No Atmosphere',
  positionMpc: SEEDED_EARTH.positionMpc,
  radiusM: 6371000,
  albedo: [0.5, 0.5, 0.5],
  orientation: [...IDENTITY_MAT3] as Mat3,
};

describe('atmosphereDrawList', () => {
  it('includes a body with a row, in near-field range, and a supra-pixel disc', () => {
    // Five Earth-radii out: a large disc, well clear of the sub-pixel floor.
    const list = atmosphereDrawList(makeState({}), makeCtx(camRadiiOut(SEEDED_EARTH, 5)));
    expect(list).toHaveLength(1);
    expect(list[0]!.body).toBe(SEEDED_EARTH);
    expect(list[0]!.params).toBe(ATMOSPHERE_PARAMS['earth']);
  });

  it('excludes a body with no ATMOSPHERE_PARAMS row', () => {
    // Earth unseeded so the only candidate is the row-less planet; supra-pixel,
    // in range — the data-gate is the sole reason it is dropped.
    const list = atmosphereDrawList(
      makeState({ earth: null, planets: [NO_ROW_PLANET] }),
      makeCtx(camRadiiOut(NO_ROW_PLANET, 5)),
    );
    expect(list).toHaveLength(0);
  });

  it('excludes a body beyond FOREGROUND_MAX_DISTANCE_MPC', () => {
    const list = atmosphereDrawList(
      makeState({}),
      makeCtx(camRadiiOut(SEEDED_EARTH, 5), FOREGROUND_MAX_DISTANCE_MPC),
    );
    expect(list).toHaveLength(0);
  });

  it('excludes a body whose disc is sub-pixel', () => {
    // ~3000 radii out drops the disc under one pixel at this fov/height, while
    // the camera stays inside the near-field edge (still a sub-picometre Mpc).
    const list = atmosphereDrawList(makeState({}), makeCtx(camRadiiOut(SEEDED_EARTH, 3000)));
    expect(list).toHaveLength(0);
  });

  it('skips a null earth without throwing', () => {
    const list = atmosphereDrawList(makeState({ earth: null, planets: [] }), makeCtx([0, 0, 0]));
    expect(list).toEqual([]);
  });

  it('includes Earth when the camera is deep inside the atmosphere shell', () => {
    // Half an Earth radius out — well inside the shell, but still a supra-pixel
    // disc and inside the near-field edge. The regression lock spec §4.6 calls
    // for: the sub-pixel cull must not accidentally exclude a body the camera
    // sits deep inside.
    const list = atmosphereDrawList(makeState({}), makeCtx(camRadiiOut(SEEDED_EARTH, 0.5)));
    expect(list).toHaveLength(1);
    expect(list[0]!.body).toBe(SEEDED_EARTH);
  });
});
