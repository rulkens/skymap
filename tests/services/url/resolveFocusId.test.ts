/**
 * Tests for resolveFocusId — the focus-id string → SelectionRef decoder.
 *
 * resolveFocusId replaces parseFocusHash (which returned a FocusTarget) +
 * resolveFocusTarget (which mapped a FocusTarget to engine state).  Here
 * the two are collapsed: we parse and resolve in one call, returning a
 * SelectionRef directly (or null when the cloud isn't loaded or the id
 * doesn't resolve to any known row).
 *
 * Returning null is REQUIRED for unresolvable ids — the reconciler saga
 * loops on catalogLoaded until non-null, so null means "try again later"
 * not "die".
 */

import { describe, it, expect } from 'vitest';
import { resolveFocusId } from '../../../src/services/url/resolveFocusId';
import { focusIdOf } from '../../../src/services/url/focusIdOf';
import { MILKY_WAY_FOCUS_ID } from '../../../src/services/url/milkyWayFocusId';
import { Source } from '../../../src/data/sources';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

/**
 * Build a one-row GalaxyCatalog fixture at a given position.
 * objIDs is BigUint64Array (unsigned 64-bit).
 */
function makeCloud(objId: bigint, pos: [number, number, number] = [1, 0, 0]): GalaxyCatalog {
  return makeGalaxyCatalog(1, {
    positions: new Float32Array(pos),
    spectroscopicZ: new Float32Array([0.01]),
    magU: new Float32Array([18]),
    magG: new Float32Array([17]),
    magR: new Float32Array([16]),
    magI: new Float32Array([16]),
    magZ: new Float32Array([16]),
    objIDs: new BigUint64Array([objId]),
    diameterKpc: new Float32Array([30]),
    axisRatio: new Float32Array([1]),
  });
}

// Standard deps: SDSS cloud has one row with objId 1237668393006604288n at
// position (1, 0, 0) → RA=0°, Dec=0°; GLADE has PGC 99 at the same pos;
// Famous cloud has row 0 indexed to famousGalaxiesMeta[0] ("m31").
const deps: ResolveDeps = {
  catalogs: {
    get: (s) => {
      if (s === Source.SDSS) return makeCloud(1237668393006604288n, [1, 0, 0]);
      if (s === Source.Glade) return makeCloud(99n, [1, 0, 0]);
      if (s === Source.TwoMRS) return makeCloud(2789n, [0, 1, 0]); // RA=90°, Dec=0°
      if (s === Source.FamousGalaxy) return makeCloud(0n, [1, 0, 0]);
      return undefined;
    },
  },
  famousGalaxiesMeta: [
    {
      id: 'm31',
      names: ['M31', 'Andromeda'],
      description: 'The Andromeda Galaxy',
      type: 'Sb',
    },
  ],
  structures: { byId: () => null },
  stars: { current: () => null },
};

describe('resolveFocusId', () => {
  // ── sdss ─────────────────────────────────────────────────────────────────

  it('sdss-<objId> → galaxy ref at the matching index', () => {
    expect(resolveFocusId('sdss-1237668393006604288', deps)).toEqual({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 0,
    });
  });

  it('sdss- with cloud not loaded → null', () => {
    const noSdss: ResolveDeps = { ...deps, catalogs: { get: () => undefined } };
    expect(resolveFocusId('sdss-1237668393006604288', noSdss)).toBeNull();
  });

  it('sdss- with id not in loaded cloud → null', () => {
    // objId 9999n is not in the SDSS cloud fixture (only 1237668393006604288n).
    expect(resolveFocusId('sdss-9999', deps)).toBeNull();
  });

  // ── pgc ──────────────────────────────────────────────────────────────────

  it('pgc-<objId> → galaxy ref in GLADE cloud', () => {
    expect(resolveFocusId('pgc-99', deps)).toEqual({
      type: 'galaxyCatalog',
      source: Source.Glade,
      index: 0,
    });
  });

  it('pgc-<objId> in 2MRS but not GLADE → 2MRS ref', () => {
    expect(resolveFocusId('pgc-2789', deps)).toEqual({
      type: 'galaxyCatalog',
      source: Source.TwoMRS,
      index: 0,
    });
  });

  it('pgc- with id not in any PGC cloud → null', () => {
    expect(resolveFocusId('pgc-99999', deps)).toBeNull();
  });

  // ── famous ───────────────────────────────────────────────────────────────

  it('famous id → galaxy ref in FamousGalaxy cloud', () => {
    expect(resolveFocusId('m31', deps)).toEqual({
      type: 'galaxyCatalog',
      source: Source.FamousGalaxy,
      index: 0,
    });
  });

  it('famous id with FamousGalaxy cloud not loaded → null', () => {
    const noFamous: ResolveDeps = {
      ...deps,
      catalogs: { get: (s) => (s === Source.SDSS ? makeCloud(1237668393006604288n) : undefined) },
    };
    expect(resolveFocusId('m31', noFamous)).toBeNull();
  });

  it('unknown famous id → null', () => {
    expect(resolveFocusId('ngc9999', deps)).toBeNull();
  });

  // ── structure ────────────────────────────────────────────────────────────

  it('cluster-<seed> → structure ref with durable id', () => {
    // The focusId is the durable instance id; resolveFocusId returns it
    // without consulting byId (structures resolve via the structure-store
    // arm; we only need to know it's a structure, not that it's loaded).
    expect(resolveFocusId('cluster-virgo', deps)).toEqual({
      type: 'structure',
      id: 'cluster-virgo',
    });
  });

  it('supercluster-<seed> → structure ref', () => {
    expect(resolveFocusId('supercluster-hydra-wall', deps)).toEqual({
      type: 'structure',
      id: 'supercluster-hydra-wall',
    });
  });

  it('void-<seed> → structure ref', () => {
    expect(resolveFocusId('void-bootes', deps)).toEqual({
      type: 'structure',
      id: 'void-bootes',
    });
  });

  it('group-<seed> → structure ref', () => {
    expect(resolveFocusId('group-local', deps)).toEqual({
      type: 'structure',
      id: 'group-local',
    });
  });

  // ── milkyWay ─────────────────────────────────────────────────────────────

  it('milkyWay literal → milkyWay singleton ref', () => {
    // The Milky Way is a singleton focal target with no per-instance data.
    // The literal comes from MILKY_WAY_FOCUS_ID — the same constant the
    // encoder (focusIdOf) emits, so the round-trip closes.
    expect(resolveFocusId(MILKY_WAY_FOCUS_ID, deps)).toEqual({ type: 'milkyWay' });
    expect(resolveFocusId('milkyWay', deps)).toEqual({ type: 'milkyWay' });
  });

  it('round-trips a milkyWay ref through encode → decode', () => {
    // Encode a milkyWay SelectionRef, then decode the resulting id back: it
    // must land on the same singleton ref. This is the guard the deep-link
    // feature exists for — encoder and decoder agreeing on the literal.
    const id = focusIdOf({ type: 'milkyWay' }, deps);
    expect(id).not.toBeNull();
    expect(resolveFocusId(id as string, deps)).toEqual({ type: 'milkyWay' });
  });

  // ── scene bodies ─────────────────────────────────────────────────────────

  it('body-<seedId> → body ref for a seeded scene body', () => {
    // SCENE_BODIES is a static import, so resolution needs no loaded catalog:
    // the fixture deps are irrelevant to this branch.
    expect(resolveFocusId('body-earth', deps)).toEqual({ type: 'body', id: 'earth' });
  });

  it('body-<unknownSeed> → null (garbage id, never "not loaded yet")', () => {
    expect(resolveFocusId('body-krypton', deps)).toBeNull();
  });

  it('round-trips a body ref through encode → decode', () => {
    const id = focusIdOf({ type: 'body', id: 'earth' }, deps);
    expect(id).toBe('body-earth');
    expect(resolveFocusId(id as string, deps)).toEqual({ type: 'body', id: 'earth' });
  });

  // ── stars ────────────────────────────────────────────────────────────────

  it('round-trips star-<index> and beats the famous fallback', () => {
    // star-42 must resolve to a positional star ref via the dedicated decoder
    // row — NOT tumble into the greedy famous scan (which its character class
    // would otherwise pass). deps.stars is null here, proving the decode never
    // touches the catalog: the index alone is the identity.
    expect(resolveFocusId('star-42', deps)).toEqual({ type: 'star', index: 42 });
    // Encode↔decode round-trip closes through the shared STAR_FOCUS_PREFIX.
    expect(focusIdOf({ type: 'star', index: 42 }, deps)).toBe('star-42');
  });

  it('star- with a non-integer / negative suffix → null', () => {
    expect(resolveFocusId('star-abc', deps)).toBeNull();
    expect(resolveFocusId('star--1', deps)).toBeNull();
  });

  it('star- with a non-canonical numeric suffix → null', () => {
    // `Number()` accepts exponent and decimal forms, so `star-1e3` would parse
    // to 1000 and silently focus the wrong star from a malformed shared URL.
    // The suffix must be digits-only (the pgc/sdss idiom), so these reject.
    expect(resolveFocusId('star-1e3', deps)).toBeNull();
    expect(resolveFocusId('star-1.5', deps)).toBeNull();
    // The canonical `star-0` stays valid.
    expect(resolveFocusId('star-0', deps)).toEqual({ type: 'star', index: 0 });
  });

  // ── structure ────────────────────────────────────────────────────────────

  it('structure id with invalid chars → null', () => {
    // The regex [a-z0-9_-]+ must fail to prevent wild input slipping through.
    expect(resolveFocusId('cluster-virgo m87', deps)).toBeNull();
  });

  // ── pos@ ─────────────────────────────────────────────────────────────────

  it('pos@ra,dec → nearest galaxy ref within 30-arcsec threshold', () => {
    // Use a local deps with exactly ONE cloud at (1, 0, 0) = RA 0°, Dec 0°.
    // The shared `deps` has three clouds at that position (SDSS, GLADE,
    // FamousGalaxy), making the nearest-neighbour winner a tie resolved by
    // GALAXY_CATALOG_SOURCES order — a fragile coupling to iteration order.
    // A single-cloud fixture makes source + index unambiguous.
    const posDeps: ResolveDeps = {
      ...deps,
      catalogs: {
        get: (s) => (s === Source.SDSS ? makeCloud(1237668393006604288n, [1, 0, 0]) : undefined),
      },
    };
    expect(resolveFocusId('pos@0.0000,0.0000', posDeps)).toEqual({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 0,
    });
  });

  it('pos@ beyond 30-arcsec threshold → null', () => {
    // RA 90°, Dec 89° is far from every test-cloud row.
    // But TwoMRS is at (0, 1, 0) → RA=90°, Dec=0°.  Use Dec 89° to push
    // past the threshold.
    expect(resolveFocusId('pos@90.0000,89.0000', deps)).toBeNull();
  });

  it('pos@ with no clouds loaded → null', () => {
    const noClouds: ResolveDeps = { ...deps, catalogs: { get: () => undefined } };
    expect(resolveFocusId('pos@0.0000,0.0000', noClouds)).toBeNull();
  });

  // ── edge cases ───────────────────────────────────────────────────────────

  it('empty string → null', () => {
    expect(resolveFocusId('', deps)).toBeNull();
  });

  it('pgc- with non-numeric suffix → null', () => {
    expect(resolveFocusId('pgc-abc', deps)).toBeNull();
  });

  it('sdss- with non-numeric suffix → null', () => {
    expect(resolveFocusId('sdss-abc', deps)).toBeNull();
  });

  it('malformed pos@ (trailing garbage) → null', () => {
    // POS_RE is anchored at both ends; extra components should fail.
    expect(resolveFocusId('pos@1,2,3', deps)).toBeNull();
  });

  it('id with invalid characters → null', () => {
    // Not a recognized prefix, not a valid famous id character class.
    expect(resolveFocusId('foo bar', deps)).toBeNull();
  });
});

/**
 * Round-trip parity: `focusIdOf` and `resolveFocusId` are inverses through the
 * shared encodeGalaxyId ladder.  This is the guard that keeps the encode home
 * single — a prefix or pos-precision drift in encodeGalaxyId would re-anchor a
 * shared URL onto a different row, and one of these cases would fail.
 *
 * Each case builds a ResolveDeps whose clouds carry the galaxy at a known index,
 * encodes a ref, then asserts the decode returns the SAME ref.
 */
describe('focusIdOf ∘ resolveFocusId round-trip', () => {
  it('SDSS ref (large objId) → sdss-<objId> → same ref', () => {
    const ref: SelectionRef = { type: 'galaxyCatalog', source: Source.SDSS, index: 0 };
    const id = focusIdOf(ref, deps);
    expect(id).toBe('sdss-1237668393006604288');
    expect(resolveFocusId(id!, deps)).toEqual(ref);
  });

  it('GLADE ref (PGC) → pgc-<pgc> → same ref', () => {
    // resolvePgc scans GLADE then 2MRS; PGC 99 lives only in GLADE here, so the
    // first hit is deterministic.
    const ref: SelectionRef = { type: 'galaxyCatalog', source: Source.Glade, index: 0 };
    const id = focusIdOf(ref, deps);
    expect(id).toBe('pgc-99');
    expect(resolveFocusId(id!, deps)).toEqual(ref);
  });

  it('GLADE ref (objId 0n) → pos@ra,dec → same ref', () => {
    // Single-cloud deps so the nearest-neighbour winner is unambiguous: only
    // GLADE is loaded, with one row at (1,0,0) → RA 0°, Dec 0°.  The stored
    // position is 0 arcsec from the encoded pos@, well under the 30-arcsec gate.
    const posDeps: ResolveDeps = {
      ...deps,
      catalogs: {
        get: (s) => (s === Source.Glade ? makeCloud(0n, [1, 0, 0]) : undefined),
      },
    };
    const ref: SelectionRef = { type: 'galaxyCatalog', source: Source.Glade, index: 0 };
    const id = focusIdOf(ref, posDeps);
    expect(id).toBe('pos@0.0000,0.0000');
    expect(resolveFocusId(id!, posDeps)).toEqual(ref);
  });

  it('FamousGalaxy ref → famous seed id → same ref', () => {
    const ref: SelectionRef = { type: 'galaxyCatalog', source: Source.FamousGalaxy, index: 0 };
    const id = focusIdOf(ref, deps);
    expect(id).toBe('m31');
    expect(resolveFocusId(id!, deps)).toEqual(ref);
  });
});
