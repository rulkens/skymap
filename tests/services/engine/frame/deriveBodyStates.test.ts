import { describe, it, expect } from 'vitest';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { ORBITAL_ELEMENTS, elementsById } from '../../../../src/data/bodies/orbitalElements';
import { BARYCENTRIC_REFLEX_BY_PRIMARY } from '../../../../src/data/bodies/barycentricPairs';
import { SCENE_ANCHORS } from '../../../../src/data/bodies/sceneAnchors';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { SURFACE_FIXED_SITES } from '../../../../src/data/bodies/surfaceFixedSites';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';
import { bodyHostId } from '../../../../src/data/bodies/positionDrivers';
import { propagateElements } from '../../../../src/utils/orbit/propagateElements';
import { keplerianPositionMpc } from '../../../../src/utils/orbit/keplerianPositionMpc';
import { PLANET_EPHEMERIS_CORRECTIONS } from '../../../../src/data/bodies/planetEphemerisCorrections.generated';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { ephemerisCorrectionMpc } from '../../../../src/utils/orbit/ephemerisCorrectionMpc';
import { siteGroundRadiusM } from '../../../../src/utils/camera/siteGroundRadiusM';
import { sitePointBodyFixed } from '../../../../src/utils/camera/sitePointBodyFixed';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { findByIdOrThrow } from '../../../../src/utils/object/findByIdOrThrow';
import BODY_STATES_J2000 from '../../../fixtures/bodyStatesJ2000.json';

const states = deriveBodyStates(CONST_J2000);
const ANCHOR_IDS = new Set(SCENE_ANCHORS.map((anchor) => anchor.id));
const MPC_TO_KM = 1 / SCALE_UNITS.KM_TO_MPC;
// 1900, a Voyager flyby, 2099: the reflex and correction are checked across the span.
const SPAN_DATES = [2415171.5, 2447763.5, 2487855.5];

function distanceKm(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) * MPC_TO_KM;
}

describe('deriveBodyStates', () => {
  it('returns a state for every driver id, and nothing else', () => {
    // Structural: catches a dropped moon (short map) or a star that is not an
    // anchor drifting in — the local star map is not clock-driven state. The
    // three summands are the three position tables `positionDrivers` unions.
    expect(states.size).toBe(
      SCENE_ANCHORS.length + ORBITAL_ELEMENTS.length + SURFACE_FIXED_SITES.length,
    );
    for (const el of ORBITAL_ELEMENTS) {
      expect(states.has(el.id)).toBe(true);
    }
    for (const anchor of SCENE_ANCHORS) {
      expect(states.has(anchor.id)).toBe(true);
    }
    for (const site of SURFACE_FIXED_SITES) {
      expect(states.has(site.id)).toBe(true);
    }
    for (const s of SCENE_STARS) {
      expect(states.has(s.id)).toBe(ANCHOR_IDS.has(s.id));
    }
  });

  it('the Galactic Centre is one state, the place — Sgr A* has none of its own', () => {
    // A second id at the centre is how a second position creeps back in: the
    // impostor hub 178 pc off the hole it hubs.
    expect(states.get('galactic-centre')).toBeDefined();
    expect(states.has('sgr-a-star')).toBe(false);
  });

  it('every element row derives a body state', () => {
    // The truncation gate for the table crossing the old MAX_ORBITS = 24, which
    // prep-01 made dynamic: asserted against ORBITAL_ELEMENTS.length so it stays
    // a check rather than a restatement of today's roster. The finiteness half is
    // what presence alone misses — a row whose unit/frame conversion produced NaN
    // still lands in the map under its own id, so `has` goes green on garbage.
    expect(ORBITAL_ELEMENTS.filter((el) => states.has(el.id))).toHaveLength(
      ORBITAL_ELEMENTS.length,
    );
    for (const el of ORBITAL_ELEMENTS) {
      const { positionMpc } = states.get(el.id)!;
      expect(positionMpc.every(Number.isFinite), `position for '${el.id}'`).toBe(true);
    }
  });

  it('J2000 snapshot is unchanged after the anchor rewrite', () => {
    // The fixture holds the J2000 body snapshot at full f64 precision, and the
    // comparison is exact — a tolerance would hide the very drift this exists to
    // catch, since reordering the focus composition must not change a single
    // term. Anchors are deliberately absent from it: their position is authored
    // rather than propagated, so the size check above is what pins their
    // presence while this pins every propagated body's value. The second loop
    // keeps the fixture total against the element table, so a body cannot escape
    // the pin by being added without a fixture row.
    for (const [id, expected] of Object.entries(BODY_STATES_J2000)) {
      const actual = states.get(id);
      expect(actual, `state for '${id}'`).toBeDefined();
      expect(actual!.positionMpc, id).toEqual(expected.positionMpc);
      expect(actual!.orientation, id).toEqual(expected.orientation);
      expect(actual!.meanAnomalyRad, id).toBe(expected.meanAnomalyRad);
    }
    for (const el of ORBITAL_ELEMENTS) {
      expect(Object.hasOwn(BODY_STATES_J2000, el.id), `'${el.id}' is in the fixture`).toBe(true);
    }
  });

  it('a moon rides its parent (Moon within its [periapsis, apoapsis] of Earth)', () => {
    // Independent orbital property, NOT a re-run of keplerianPositionMpc: the
    // geocentric distance of any point on the Moon's ellipse is bounded by its
    // periapsis a(1−e) and apoapsis a(1+e). If the parent hop were dropped (moon
    // placed heliocentric, or added to the wrong focus) this band would fail.
    const moon = states.get('moon')!;
    const earth = states.get('earth')!;
    const { semiMajorMpc: a, eccentricity: e } = elementsById('moon');
    const periapsis = a * (1 - e);
    const apoapsis = a * (1 + e);

    const dx = moon.positionMpc[0] - earth.positionMpc[0];
    const dy = moon.positionMpc[1] - earth.positionMpc[1];
    const dz = moon.positionMpc[2] - earth.positionMpc[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    expect(dist).toBeGreaterThanOrEqual(periapsis);
    expect(dist).toBeLessThanOrEqual(apoapsis);
  });

  it('is memoized on simDays (same instant ⇒ same Map reference)', () => {
    // A frame reads this snapshot from several passes; every reader must see the
    // one instant, so an unchanged simDays returns the SAME Map (paused-frame
    // free-ride + no draw-vs-pick tearing), and a new instant returns a fresh one.
    const t = CONST_J2000 + 4000;
    const first = deriveBodyStates(t);
    const second = deriveBodyStates(t);
    expect(second).toBe(first);

    const later = deriveBodyStates(t + 1);
    expect(later).not.toBe(first);
  });

  it("a moon's snapshot position rides its propagated parent", () => {
    // 0.1 century off epoch: Jupiter has moved, and Io (1.76 d period) is many
    // orbits from its epoch phase. Io's snapshot offset from Jupiter's snapshot
    // must equal Io's Jupiter-relative PROPAGATED position — the parent hop uses
    // the snapshot Jupiter, and the moon offset uses propagated (not epoch)
    // elements. An epoch-only moon offset would miss by ~a whole orbit radius.
    const t = CONST_J2000 + 3652.5;
    const snap = deriveBodyStates(t);
    const io = snap.get('io')!;
    const jupiter = snap.get('jupiter')!;
    const ioRelative = keplerianPositionMpc(propagateElements(elementsById('io'), t));

    expect(io.positionMpc[0] - jupiter.positionMpc[0]).toBeCloseTo(ioRelative[0], 18);
    expect(io.positionMpc[1] - jupiter.positionMpc[1]).toBeCloseTo(ioRelative[1], 18);
    expect(io.positionMpc[2] - jupiter.positionMpc[2]).toBeCloseTo(ioRelative[2], 18);
  });

  it('Earth–Moon reflex keeps the barycentre and the separation', () => {
    // Earth's row is the barycentre: weighting Earth and Moon by mass must land back
    // on the corrected row position, and the Moon's offset from Earth stays raw Kepler.
    const k = BARYCENTRIC_REFLEX_BY_PRIMARY.get('earth')!.k;
    for (const t of SPAN_DATES) {
      const snap = deriveBodyStates(t);
      const earth = snap.get('earth')!.positionMpc;
      const moon = snap.get('moon')!.positionMpc;
      const sun = snap.get('sun')!.positionMpc;
      const rowKepler = keplerianPositionMpc(propagateElements(elementsById('earth'), t));
      const correction = ephemerisCorrectionMpc(PLANET_EPHEMERIS_CORRECTIONS['earth']!, t);
      const emb = [0, 1, 2].map((i) => sun[i]! + rowKepler[i]! + correction[i]!);
      const weighted = [0, 1, 2].map((i) => (1 - k) * earth[i]! + k * moon[i]!);
      expect(distanceKm(weighted, emb)).toBeLessThan(1e-3);

      const moonKepler = keplerianPositionMpc(propagateElements(elementsById('moon'), t));
      const separation = [0, 1, 2].map((i) => moon[i]! - earth[i]!);
      expect(distanceKm(separation, moonKepler)).toBeLessThan(1e-3);
    }
  });

  it('an Earth surface site keeps its offset from the wobbling Earth', () => {
    // The site rides the reflexed Earth, so its offset is the body-fixed point under
    // Earth's spin alone — the ~4,700 km wobble must not leak into it.
    const site = findByIdOrThrow(SURFACE_FIXED_SITES, 'soendermarken', 'test');
    for (const t of SPAN_DATES) {
      const snap = deriveBodyStates(t);
      const earth = snap.get('earth')!;
      const offsetM = rotateVec3ByTightMat3(
        sitePointBodyFixed(site, siteGroundRadiusM(site, SCENE_EARTH.surface.datumRadiusM)),
        earth.orientation,
      );
      const offsetMpc = offsetM.map((m) => m * SCALE_UNITS.M_TO_MPC);
      const actual = snap.get(site.id)!.positionMpc.map((v, i) => v - earth.positionMpc[i]!);
      expect(distanceKm(actual, offsetMpc)).toBeLessThan(1e-3);
    }
  });

  it('orientation is identity iff the body has no rotation row', () => {
    // Matches orientationForBody's row-gate contract: a body with a row (Earth)
    // carries a baked IAU rotation; a row-less one (the Galactic Centre) carries identity.
    expect(states.get('galactic-centre')!.orientation).toEqual([...IDENTITY_MAT3]);
    expect(states.get('earth')!.orientation).not.toEqual([...IDENTITY_MAT3]);
  });

  // The host direction leaves a moon's equator only by the gap between its IAU pole and its
  // orbit normal (measured <= 1.6 deg for all thirteen, Iapetus's 15 deg pole tilt included); 5 deg
  // keeps headroom without admitting the 14+ deg drifts this guards against.
  const TIDAL_LOCK_MAX_DEG = 5;
  const SYNCHRONOUS_MOONS = [
    'phobos',
    'deimos',
    'io',
    'europa',
    'ganymede',
    'callisto',
    'mimas',
    'enceladus',
    'tethys',
    'dione',
    'rhea',
    'titan',
    'iapetus',
    'miranda',
    'ariel',
    'umbriel',
    'titania',
    'oberon',
    'puck',
    'triton',
    'proteus',
  ];

  it.each(SYNCHRONOUS_MOONS)(
    'synchronous moon %s keeps longitude 0 toward its host at J2000 and +10 yr',
    (id) => {
      for (const simDays of [CONST_J2000, CONST_J2000 + 3650]) {
        const snap = deriveBodyStates(simDays);
        const moon = snap.get(id)!;
        const host = snap.get(bodyHostId(id)!)!;
        const d = [0, 1, 2].map((k) => host.positionMpc[k]! - moon.positionMpc[k]!);
        const len = Math.hypot(d[0]!, d[1]!, d[2]!);
        const o = moon.orientation as number[];
        const cos = (o[0]! * d[0]! + o[1]! * d[1]! + o[2]! * d[2]!) / len;
        const angleDeg = (Math.acos(cos) * 180) / Math.PI;
        expect(angleDeg, `${id} at day ${simDays - CONST_J2000}`).toBeLessThan(TIDAL_LOCK_MAX_DEG);
      }
    },
  );
});
