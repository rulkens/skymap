/**
 * useUrlSync — pure-helper coverage.
 *
 * The hook itself is DOM glue over `location.hash` and `history.pushState`,
 * and the project's vitest config runs in node env (no DOM).  Following
 * the same pattern as the legacy `useFocusUrlSync.test.ts`, we test the
 * pure decision functions directly — `computeDesiredHash` and
 * `initialPendingFromHash` — and rely on manual smoke testing for the
 * effect plumbing.
 *
 * Interesting branches:
 *   1. computeDesiredHash with neither set → empty body.
 *   2. computeDesiredHash with only focused (galaxy) → `focus=<id>` body.
 *   3. computeDesiredHash with only focusedPoiId → `poi=<id>` body.
 *   4. computeDesiredHash with BOTH set → galaxy wins (mutex tiebreak).
 *   5. computeDesiredHash short-circuits when currentHash matches.
 *   6. initialPendingFromHash disambiguates #focus= vs #poi= vs empty.
 */
import { describe, it, expect } from 'vitest';
import { computeDesiredHash, initialPendingFromHash } from '../../src/hooks/useUrlSync';
import type { GalaxyInfo } from '../../src/@types/engine/GalaxyInfo';
import { Source } from '../../src/data/sources';

// Minimal galaxy fixture — selectionToFocusId only needs `source` +
// identity fields.  Mirror the shape the legacy test uses.
function makeGalaxy(): GalaxyInfo {
  return {
    source: Source.SDSS,
    objID: 1234567890n,
  } as unknown as GalaxyInfo;
}

describe('computeDesiredHash (unified)', () => {
  it('returns empty body when neither selection is set', () => {
    const out = computeDesiredHash({ focused: null, focusedPoiId: null, currentHash: '' });
    expect(out.desiredHashBody).toBe('');
    expect(out.matches).toBe(true);
  });

  it('returns focus=<id> when only a galaxy is focused', () => {
    const out = computeDesiredHash({ focused: makeGalaxy(), focusedPoiId: null, currentHash: '' });
    expect(out.desiredHashBody).toMatch(/^focus=/);
    expect(out.matches).toBe(false);
  });

  it('returns poi=<id> when only a POI is focused', () => {
    const out = computeDesiredHash({
      focused: null,
      focusedPoiId: 'virgo-cluster',
      currentHash: '',
    });
    expect(out.desiredHashBody).toBe('poi=virgo-cluster');
    expect(out.matches).toBe(false);
  });

  it('prefers galaxy when both are set (engine mutex tiebreak)', () => {
    const out = computeDesiredHash({
      focused: makeGalaxy(),
      focusedPoiId: 'virgo-cluster',
      currentHash: '',
    });
    expect(out.desiredHashBody).toMatch(/^focus=/);
  });

  it('short-circuits when currentHash already matches a poi body', () => {
    const out = computeDesiredHash({
      focused: null,
      focusedPoiId: 'virgo-cluster',
      currentHash: '#poi=virgo-cluster',
    });
    expect(out.matches).toBe(true);
  });

  it('short-circuits when currentHash already matches the empty body', () => {
    const out = computeDesiredHash({ focused: null, focusedPoiId: null, currentHash: '' });
    expect(out.matches).toBe(true);
  });
});

describe('initialPendingFromHash', () => {
  it('parses #focus=… into a galaxy pending target', () => {
    // Use a valid pgc- format (dash, not colon — parseFocusHash uses `pgc-`
    // prefix; a colon would reject to null via the famous-id regex).
    const out = initialPendingFromHash('#focus=pgc-1234');
    expect(out.kind).toBe('galaxy');
    if (out.kind === 'galaxy') expect(out.target).not.toBeNull();
  });

  it('parses #poi=… into a poi pending id', () => {
    const out = initialPendingFromHash('#poi=virgo-cluster');
    expect(out.kind).toBe('poi');
    if (out.kind === 'poi') expect(out.poiId).toBe('virgo-cluster');
  });

  it('returns kind=null for an empty hash', () => {
    const out = initialPendingFromHash('');
    expect(out.kind).toBeNull();
  });

  it('returns kind=null for an unrecognized hash', () => {
    const out = initialPendingFromHash('#something-else');
    expect(out.kind).toBeNull();
  });
});
