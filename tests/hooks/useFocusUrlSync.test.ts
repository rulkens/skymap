/**
 * Tests for the pure helpers that back `useFocusUrlSync`.
 *
 * Why test helpers, not the React hook itself?  The project's vitest
 * config runs in the `node` environment (see `vitest.config.ts`) — there
 * is intentionally no DOM, so any `renderHook` / React-DOM exercise
 * would pull in `jsdom`/`happy-dom` as a new dev dependency.  The hook
 * is deliberately a thin glue layer: all decision logic lives in
 * `computeDesiredHash` (pure, takes inputs, returns outputs) and
 * `initialPendingTarget` (pure parse wrapper).  Hammer those in node
 * and the React side becomes unfailable trivia — `useEffect` calling
 * a function whose every branch is already covered.
 *
 * Test fixture style mirrors `tests/services/url/focusUrl.test.ts`:
 * a `baseInfo` factory builds a minimal `GalaxyInfo` with only the
 * fields the codec reads (source, objID, ra, dec, famous), and the
 * cast goes through `unknown` so we don't have to keep 30 fields in
 * sync just to flex one branch of logic.
 */

import { describe, it, expect } from 'vitest';
import {
  computeDesiredHash,
  initialPendingTarget,
} from '../../src/hooks/useFocusUrlSync';
import { Source } from '../../src/data/sources';
import type { GalaxyInfo } from '../../src/@types/engine/GalaxyInfo';

const baseInfo = (overrides: Partial<GalaxyInfo>): GalaxyInfo =>
  ({
    index: 0,
    objID: 0n,
    x: 0,
    y: 0,
    z: 0,
    ra: 10.123,
    dec: -5.456,
    raSexagesimal: '00h00m00s',
    decSexagesimal: "+00°00'00\"",
    redshift: 0.01,
    distanceMpc: 40,
    hubbleVelocityKmS: 3000,
    lookbackGyr: 0.1,
    earthEra: 'recent',
    magU: 18,
    magG: 18,
    magR: 18,
    magI: 18,
    magZ: 18,
    bands: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
    colours: [],
    absoluteMagG: -20,
    galaxyType: { category: 'unknown', description: '' } as GalaxyInfo['galaxyType'],
    iauName: 'X',
    displayName: 'X',
    source: Source.Glade,
    sourceLabel: 'GLADE',
    catalogUrl: null,
    diameterKpc: 30,
    diameterProvenance: 'fallback (30 kpc)',
    orientation: { axisRatio: 1, positionAngleDeg: 0, provenance: 'deterministic fallback' },
    thumbnailUrl: 'https://example.test/thumb.jpg',
    ...overrides,
  }) as unknown as GalaxyInfo;

describe('computeDesiredHash', () => {
  it('returns empty body and matches=true when nothing is selected and the hash is already empty', () => {
    expect(computeDesiredHash({ selected: null, currentHash: '' })).toEqual({
      desiredHashBody: '',
      matches: true,
    });
  });

  it('returns empty body and matches=false when nothing is selected but the URL still has a focus hash', () => {
    expect(
      computeDesiredHash({ selected: null, currentHash: '#focus=m31' }),
    ).toEqual({ desiredHashBody: '', matches: false });
  });

  it('treats Synthetic-source selections like "no selection" — empty body, mismatched against a stale hash', () => {
    // selectionToFocusId returns null for synthetic; the helper must
    // surface that as "URL should have no hash", and when the URL
    // currently *does* have one, the caller needs to know to scrub it.
    const synth = baseInfo({ source: Source.Synthetic });
    expect(
      computeDesiredHash({ selected: synth, currentHash: '#focus=m31' }),
    ).toEqual({ desiredHashBody: '', matches: false });
  });

  it('encodes a famous selection into focus=<id>', () => {
    const info = baseInfo({
      source: Source.Famous,
      famous: {
        id: 'm31',
        names: ['M31', 'Andromeda Galaxy'],
        description: '',
        type: 'SBb',
        xref: null,
      },
    });
    expect(computeDesiredHash({ selected: info, currentHash: '' })).toEqual({
      desiredHashBody: 'focus=m31',
      matches: false,
    });
  });

  it('short-circuits when the current hash already matches the desired body (no-op write avoidance)', () => {
    const info = baseInfo({
      source: Source.Famous,
      famous: {
        id: 'm31',
        names: ['M31'],
        description: '',
        type: 'SBb',
        xref: null,
      },
    });
    // The leading `#` is part of `location.hash` in the browser; the
    // helper must compare without it.
    expect(
      computeDesiredHash({ selected: info, currentHash: '#focus=m31' }),
    ).toEqual({ desiredHashBody: 'focus=m31', matches: true });
  });

  it('encodes a non-SDSS objID-bearing selection into focus=pgc-<n>', () => {
    const info = baseInfo({ source: Source.Glade, objID: 2789n });
    expect(computeDesiredHash({ selected: info, currentHash: '' })).toEqual({
      desiredHashBody: 'focus=pgc-2789',
      matches: false,
    });
  });

  it('encodes an SDSS selection into focus=sdss-<objID>', () => {
    // SDSS objIDs are 19-digit bigints — verify the codec handles them
    // without precision loss across the helper boundary.
    const info = baseInfo({ source: Source.SDSS, objID: 1237665128253423687n });
    expect(computeDesiredHash({ selected: info, currentHash: '' })).toEqual({
      desiredHashBody: 'focus=sdss-1237665128253423687',
      matches: false,
    });
  });

  it('falls back to focus=pos@ra,dec when no objID and no famous metadata', () => {
    const info = baseInfo({
      source: Source.TwoMRS,
      objID: 0n,
      ra: 10.1234567,
      dec: -5.4567,
    });
    expect(computeDesiredHash({ selected: info, currentHash: '' })).toEqual({
      desiredHashBody: 'focus=pos@10.1235,-5.4567',
      matches: false,
    });
  });
});

describe('initialPendingTarget', () => {
  it('returns null for an empty hash', () => {
    expect(initialPendingTarget('')).toBeNull();
  });

  it('returns null for an unrecognised hash', () => {
    expect(initialPendingTarget('#bogus')).toBeNull();
  });

  it('parses a famous hash to a famous target', () => {
    expect(initialPendingTarget('#focus=m31')).toEqual({
      kind: 'famous',
      id: 'm31',
    });
  });

  it('parses a pgc hash to a pgc target with bigint precision', () => {
    expect(initialPendingTarget('#focus=pgc-2789')).toEqual({
      kind: 'pgc',
      pgc: 2789n,
    });
  });
});
