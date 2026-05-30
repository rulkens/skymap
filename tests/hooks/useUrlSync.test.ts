/**
 * useUrlSync — pure-helper coverage.
 *
 * The hook itself is DOM glue over `location.hash` and `history.pushState`,
 * vitest runs in node env (no DOM).  We test the pure decision functions
 * directly — `computeDesiredHash` and `initialPendingFromHash` — and rely
 * on manual smoke testing for the effect plumbing.
 *
 * `focused` is a FocusableTarget union (galaxy | POI | null); the body
 * shape is decided by isPoi() inside the helper.
 */
import { describe, it, expect } from 'vitest';
import { computeDesiredHash, initialPendingFromHash } from '../../src/hooks/useUrlSync';
import type { GalaxyInfo } from '../../src/@types/engine/GalaxyInfo';
import type { PointOfInterest } from '../../src/@types/engine/subsystems/PointOfInterest';
import { Source } from '../../src/data/sources';

function makeGalaxy(): GalaxyInfo {
  return {
    source: Source.SDSS,
    objID: 1234567890n,
  } as unknown as GalaxyInfo;
}

function makePoi(id: string): PointOfInterest {
  return { id, name: id, category: 'cluster', worldPos: [0, 0, 0], featured: true };
}

describe('computeDesiredHash (unified)', () => {
  it('returns empty body when focus is null', () => {
    const out = computeDesiredHash({ focused: null, currentHash: '' });
    expect(out.desiredHashBody).toBe('');
    expect(out.matches).toBe(true);
  });

  it('returns focus=<id> when focused is a galaxy', () => {
    const out = computeDesiredHash({ focused: makeGalaxy(), currentHash: '' });
    expect(out.desiredHashBody).toMatch(/^focus=/);
    expect(out.matches).toBe(false);
  });

  it('returns poi=<id> when focused is a POI', () => {
    const out = computeDesiredHash({
      focused: makePoi('virgo-cluster'),
      currentHash: '',
    });
    expect(out.desiredHashBody).toBe('poi=virgo-cluster');
    expect(out.matches).toBe(false);
  });

  it('short-circuits when currentHash already matches a poi body', () => {
    const out = computeDesiredHash({
      focused: makePoi('virgo-cluster'),
      currentHash: '#poi=virgo-cluster',
    });
    expect(out.matches).toBe(true);
  });

  it('short-circuits when currentHash already matches the empty body', () => {
    const out = computeDesiredHash({ focused: null, currentHash: '' });
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
