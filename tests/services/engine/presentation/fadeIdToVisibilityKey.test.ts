/**
 * fadeIdToVisibilityKey — tests for the FadeId → VisibilityLayerKey bridge.
 *
 * The implementation is two `satisfies Record<...>` tables — one keyed by
 * `FadeId['kind']`, one keyed by `LabelLayerId` — with a single branch on
 * `h.kind === 'labelLayer'` choosing which table to index. `satisfies Record`
 * already makes both tables total at compile time: omitting a key is a type
 * error. What it can't catch is a key mapped to the *wrong* value — a typo'd
 * or transposed `VisibilityLayerKey` still satisfies the `Record` shape.
 * These tests are the check against that failure mode: they assert the
 * actual runtime value for each row, not just that a value exists.
 *
 * We do NOT test every single FadeId discriminator variant (every
 * GalaxyCatalogId, every StructureId, …) — that would be a mechanical
 * mirror of the implementation. Instead we verify one representative per
 * `kind`, plus every row of the `LabelLayerId` table, since that table is a
 * separate correctness concern from the outer one.
 */

import { describe, it, expect } from 'vitest';
import { fadeIdToVisibilityKey } from '../../../../src/services/engine/presentation/fadeIdToVisibilityKey';

describe('fadeIdToVisibilityKey', () => {
  it("maps a flow id to 'flow'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'flow' })).toBe('flow');
  });

  it("maps a filament id to 'filaments'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'filament' })).toBe('filaments');
  });

  it("maps an orbitTrails id to 'orbitTrails'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'orbitTrails' })).toBe('orbitTrails');
  });

  it("maps a constellations id to 'constellations'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'constellations' })).toBe('constellations');
  });

  it("maps a structure ring id to 'structureRing'", () => {
    // All StructureId values collapse to the same key.
    expect(fadeIdToVisibilityKey({ kind: 'structure', id: 'cluster' })).toBe('structureRing');
    expect(fadeIdToVisibilityKey({ kind: 'structure', id: 'supercluster' })).toBe('structureRing');
    expect(fadeIdToVisibilityKey({ kind: 'structure', id: 'void' })).toBe('structureRing');
    expect(fadeIdToVisibilityKey({ kind: 'structure', id: 'group' })).toBe('structureRing');
  });

  it("maps a galaxyCatalog id to 'survey'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'galaxyCatalog', id: 'sdss' })).toBe('survey');
    expect(fadeIdToVisibilityKey({ kind: 'galaxyCatalog', id: '2mrs' })).toBe('survey');
  });

  it("maps milkyWay to 'milkyWayDisk'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'milkyWay' })).toBe('milkyWayDisk');
  });

  it("maps volumesMaster to 'volumesMaster'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'volumesMaster' })).toBe('volumesMaster');
  });

  it("maps a volumeField id to 'volumeField'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'volumeField', id: 'cf4-density' })).toBe('volumeField');
  });

  // LabelLayerId table.
  it("maps labelLayer 'milkyWay' to 'milkyWayLabel'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'labelLayer', layer: 'milkyWay' })).toBe('milkyWayLabel');
  });

  it("maps labelLayer 'galaxy' to 'surveyLabel'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'labelLayer', layer: 'galaxy' })).toBe('surveyLabel');
  });

  it("maps labelLayer 'scaleBar' to 'scaleBar'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'labelLayer', layer: 'scaleBar' })).toBe('scaleBar');
  });

  it("maps labelLayer 'structure' to 'structureLabel' regardless of item discriminator", () => {
    // Without item.
    expect(fadeIdToVisibilityKey({ kind: 'labelLayer', layer: 'structure' })).toBe(
      'structureLabel',
    );
    // With item — same result (per-item discrimination is deferred).
    expect(fadeIdToVisibilityKey({ kind: 'labelLayer', layer: 'structure', item: 'cluster' })).toBe(
      'structureLabel',
    );
  });

  it("maps labelLayer 'starCatalog' to 'starCatalogLabel'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'labelLayer', layer: 'starCatalog' })).toBe(
      'starCatalogLabel',
    );
  });

  it("maps labelLayer 'body' to 'bodyLabel'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'labelLayer', layer: 'body' })).toBe('bodyLabel');
  });

  // Non-clip-fadeable kinds.
  it('returns undefined for non-clip-fadeable kinds (overlay)', () => {
    expect(fadeIdToVisibilityKey({ kind: 'overlay', id: 'proceduralDisks' })).toBeUndefined();
    expect(fadeIdToVisibilityKey({ kind: 'overlay', id: 'texturedDisks' })).toBeUndefined();
  });
});
