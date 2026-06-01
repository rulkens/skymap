/**
 * AssetKey — compile-time assignability check.
 *
 * Confirms that every variant of `AssetKey` is accepted: a concrete numeric
 * `Source` value (covering `SourceType`), and each of the three auxiliary
 * string keys (`'clusterCatalog'`, `'famousMeta'`, `'pgcAlias'`).
 *
 * These are purely compile-time assertions. If `AssetKey` drifts from its
 * spec (e.g. a string key is dropped, or `SourceType` stops widening to it),
 * this file stops compiling and the typecheck gate catches it.
 */

import { describe, expect, it } from 'vitest';
import type { AssetKey } from '../../../src/@types/loading/AssetKey';
import { Source } from '../../../src/data/sources';

describe('AssetKey assignability', () => {
  it('accepts a SourceType value (Source.SDSS)', () => {
    const k: AssetKey = Source.SDSS;
    expect(k).toBe(Source.SDSS);
  });

  it("accepts 'clusterCatalog'", () => {
    const k: AssetKey = 'clusterCatalog';
    expect(k).toBe('clusterCatalog');
  });

  it("accepts 'famousMeta'", () => {
    const k: AssetKey = 'famousMeta';
    expect(k).toBe('famousMeta');
  });

  it("accepts 'pgcAlias'", () => {
    const k: AssetKey = 'pgcAlias';
    expect(k).toBe('pgcAlias');
  });
});
