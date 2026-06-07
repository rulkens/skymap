/**
 * AssetKey — compile-time assignability check.
 *
 * Confirms that every variant of `AssetKey` is accepted: a concrete numeric
 * `Source` value (covering `SourceType`), and each of the auxiliary string
 * keys (`'structureCatalog'`, `'famousMeta'`, `'pgcAlias'`, `'filaments'`,
 * `'cf4Density'`, `'mcpm'`).
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

  it("accepts 'structureCatalog'", () => {
    const k: AssetKey = 'structureCatalog';
    expect(k).toBe('structureCatalog');
  });

  it("accepts 'famousMeta'", () => {
    const k: AssetKey = 'famousMeta';
    expect(k).toBe('famousMeta');
  });

  it("accepts 'pgcAlias'", () => {
    const k: AssetKey = 'pgcAlias';
    expect(k).toBe('pgcAlias');
  });

  it("accepts 'filaments'", () => {
    const k: AssetKey = 'filaments';
    expect(k).toBe('filaments');
  });

  it("accepts 'cf4Density'", () => {
    const k: AssetKey = 'cf4Density';
    expect(k).toBe('cf4Density');
  });

  it("accepts 'mcpm'", () => {
    const k: AssetKey = 'mcpm';
    expect(k).toBe('mcpm');
  });
});
