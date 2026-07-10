/**
 * fadeIdToVisibilityKey — tests for the FadeId → VisibilityLayerKey bridge.
 *
 * Covers the three assertions in the task-12 checklist:
 *   1. Spot-checks that concrete FadeId values map to the expected key.
 *   2. `overlay` returns `undefined` (no clip-layer address).
 *   3. Exhaustiveness — the switch has no `default` arm, so tsc enforces
 *      coverage; this file verifies the mappings at runtime.
 *
 * We do NOT test every single FadeId discriminator variant (every
 * GalaxyCatalogId, every StructureId, …) — that would be a mechanical
 * mirror of the implementation. Instead we verify one representative from
 * each kind, plus the LabelLayerId sub-switch in full (four members, four
 * results) because that inner switch is a separate exhaustiveness concern.
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

  // labelLayer sub-switch — all four LabelLayerId members.
  it("maps labelLayer 'milkyWay' to 'milkyWayLabel'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'labelLayer', layer: 'milkyWay' })).toBe('milkyWayLabel');
  });

  it("maps labelLayer 'galaxyNames' to 'surveyLabel'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'labelLayer', layer: 'galaxyNames' })).toBe('surveyLabel');
  });

  it("maps labelLayer 'scaleBar' to 'scaleBar'", () => {
    expect(fadeIdToVisibilityKey({ kind: 'labelLayer', layer: 'scaleBar' })).toBe('scaleBar');
  });

  it("maps labelLayer 'structure' to 'structureLabel' regardless of category discriminator", () => {
    // Without category.
    expect(fadeIdToVisibilityKey({ kind: 'labelLayer', layer: 'structure' })).toBe(
      'structureLabel',
    );
    // With category — same result (per-category discrimination is deferred).
    expect(
      fadeIdToVisibilityKey({ kind: 'labelLayer', layer: 'structure', category: 'cluster' }),
    ).toBe('structureLabel');
  });

  // Non-clip-fadeable kinds.
  it('returns undefined for non-clip-fadeable kinds (overlay)', () => {
    expect(fadeIdToVisibilityKey({ kind: 'overlay', id: 'proceduralDisks' })).toBeUndefined();
    expect(fadeIdToVisibilityKey({ kind: 'overlay', id: 'texturedDisks' })).toBeUndefined();
  });
});
