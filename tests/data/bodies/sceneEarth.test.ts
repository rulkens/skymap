import { describe, it, expect } from 'vitest';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { rotationFromIau } from '../../../src/utils/orbit/rotationFromIau';
import { rotationById } from '../../../src/data/bodies/rotationElements';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';

const hypot3 = (v: readonly [number, number, number]) => Math.hypot(v[0], v[1], v[2]);

// Earth's position + orientation live in its derived BodyState, not the record.
const earthState = deriveBodyStates(CONST_J2000).get('earth')!;

describe('SCENE_EARTH', () => {
  it('radius is 6371 km, authored in metres', () => {
    expect(SCENE_EARTH.radiusM).toBe(6371000);
  });

  it('carries no baked position or orientation (identity-only record)', () => {
    // The split's on-disk shape: state was lifted off the record onto the derive.
    expect('positionMpc' in SCENE_EARTH).toBe(false);
    expect('orientation' in SCENE_EARTH).toBe(false);
    // The Blue Marble no longer rides a per-body URL either: it joins the keyed
    // `bodyTextures` slot family.
    expect('textureUrl' in SCENE_EARTH).toBe(false);
  });

  it('sits ~1 AU from the Sun (derived J2000 heliocentric position)', () => {
    // Earth's position is DERIVED from ORBITAL_ELEMENTS, not pinned to the old
    // [1 AU, 0, 0] literal (which would just restate the table). Pinning the
    // exact derived xyz would be the same restatement one indirection out, so
    // this is a STRUCTURAL band: Earth's heliocentric distance stays within
    // a(1±e) ≈ 0.983–1.017 AU of the Sun — order-of-magnitude proof, not a
    // value pin.
    const distAu = hypot3(earthState.positionMpc) / SCALE_UNITS.AU_TO_MPC;
    expect(distAu).toBeGreaterThan(0.97);
    expect(distAu).toBeLessThan(1.03);
  });

  it('derives a baked orientation from the IAU rotation elements', () => {
    // Earth's facing is baked from its IAU rotation elements through the same
    // util the derive calls — this pins the wiring, not a matrix restatement.
    expect(earthState.orientation).toEqual(rotationFromIau(rotationById('earth')));
  });
});
