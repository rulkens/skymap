/**
 * useUrlSync — pure-helper coverage.
 *
 * The hook itself is DOM glue over `location.hash` and `history.pushState`,
 * vitest runs in node env (no DOM).  We test the pure decision functions
 * directly — `computeDesiredHash` and `initialPendingFromHash` — and rely
 * on manual smoke testing for the effect plumbing.
 *
 * `focused` is a FocusableTarget union (galaxy | structure | null); the
 * body shape is decided by isStructure() inside the helper.
 */
import { describe, it, expect } from 'vitest';
import { computeDesiredHash, initialPendingFromHash } from '../../src/hooks/useUrlSync';
import type { GalaxyInfo } from '../../src/@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../src/@types/data/structure/StructureInfo';
import { Source } from '../../src/data/sources';

function makeGalaxy(): GalaxyInfo {
  return {
    source: Source.SDSS,
    objID: 1234567890n,
  } as unknown as GalaxyInfo;
}

function makeStructure(id: string): StructureInfo {
  return {
    type: 'structure',
    id,
    name: id,
    category: 'cluster',
    worldPos: [0, 0, 0],
    featured: true,
    physicalRadiusMpc: 2,
  };
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

  it('writes focus=<id> when focused is a structure', () => {
    const out = computeDesiredHash({
      focused: makeStructure('cluster-virgo-m87'),
      currentHash: '',
    });
    expect(out.desiredHashBody).toBe('focus=cluster-virgo-m87');
    expect(out.matches).toBe(false);
  });

  it('short-circuits when currentHash already matches a structure body', () => {
    const out = computeDesiredHash({
      focused: makeStructure('cluster-virgo-m87'),
      currentHash: '#focus=cluster-virgo-m87',
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

  it('routes #focus=cluster-virgo-m87 to kind structure with the id', () => {
    const out = initialPendingFromHash('#focus=cluster-virgo-m87');
    expect(out.kind).toBe('structure');
    if (out.kind === 'structure') expect(out.id).toBe('cluster-virgo-m87');
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
