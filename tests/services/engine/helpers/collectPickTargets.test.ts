/**
 * collectPickTargets — the unified "what's pickable this frame" gate.
 *
 * The regression that motivated the helper: clusters draw into the pick
 * texture via structureMarkerRenderer.pickRing but are NOT galaxy catalogs,
 * so a gate that bailed on "no visible galaxy sources" made clusters
 * unpickable (and the pick-debug overlay black) whenever every galaxy
 * catalog was toggled off.  The `hasAny` flag must stay true on a
 * cluster-only frame.
 */

import { describe, it, expect } from 'vitest';
import { collectPickTargets } from '../../../../src/services/engine/helpers/collectPickTargets';
import type { PointRenderer } from '../../../../src/@types/rendering/PointRenderer';
import type { StructureMarkerRenderer } from '../../../../src/@types/rendering/StructureMarkerRenderer';
import type { PickSourceDraw } from '../../../../src/@types/rendering/PickSourceDraw';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import { Source } from '../../../../src/data/sources';

// Minimal renderer stub: only loadedSources() is read.  Each draw record
// carries just a `source` enum value (the rest of PickSourceDraw is GPU
// plumbing the filter never inspects).
function makeRenderer(sources: readonly SourceType[]): PointRenderer {
  return {
    loadedSources: () =>
      sources
        .map(
          (source) =>
            ({
              source,
              vertexBuffer: {} as GPUBuffer,
              count: 1,
              sourceBuffer: {} as GPUBuffer,
            }) as PickSourceDraw,
        )
        [Symbol.iterator](),
  } as unknown as PointRenderer;
}

function makeStructureMarkerRenderer(markerCount: number): StructureMarkerRenderer {
  return { markerCount: () => markerCount } as unknown as StructureMarkerRenderer;
}

// pickMask bit for a source code.
const mask = (...codes: number[]) => codes.reduce((m, c) => m | (1 << c), 0);

describe('collectPickTargets', () => {
  it('returns visible galaxy sources filtered by the pick mask', () => {
    const renderer = makeRenderer([Source.SDSS, Source.TwoMRS, Source.Glade]);
    // Only SDSS + GLADE bits set.
    const { visibleSources, hasAny } = collectPickTargets(
      renderer,
      mask(Source.SDSS, Source.Glade),
      null,
    );
    expect(hasAny).toBe(true);
    expect(visibleSources.map((s) => s.source)).toEqual([Source.SDSS, Source.Glade]);
  });

  it('hasAny is false when no galaxy catalog is masked-in and no cluster markers exist', () => {
    const renderer = makeRenderer([Source.SDSS, Source.TwoMRS]);
    const { visibleSources, hasAny } = collectPickTargets(renderer, mask(), null);
    expect(visibleSources).toHaveLength(0);
    expect(hasAny).toBe(false);
  });

  it('hasAny is TRUE on a cluster-only frame: no visible galaxy catalogs but cluster markers present', () => {
    // The bug this helper fixes — galaxies off, clusters on screen.
    const renderer = makeRenderer([Source.SDSS, Source.TwoMRS, Source.Glade]);
    const { visibleSources, hasAny } = collectPickTargets(
      renderer,
      mask(), // every galaxy catalog toggled off
      makeStructureMarkerRenderer(42), // 42 structure rings queued
    );
    expect(visibleSources).toHaveLength(0);
    expect(hasAny).toBe(true);
  });

  it('hasAny is false when the cluster renderer exists but has zero markers (category hidden / all faded)', () => {
    const renderer = makeRenderer([Source.SDSS]);
    const { hasAny } = collectPickTargets(renderer, mask(), makeStructureMarkerRenderer(0));
    expect(hasAny).toBe(false);
  });

  it('hasAny is true when both galaxy catalogs and cluster markers are present', () => {
    const renderer = makeRenderer([Source.SDSS]);
    const { hasAny } = collectPickTargets(
      renderer,
      mask(Source.SDSS),
      makeStructureMarkerRenderer(5),
    );
    expect(hasAny).toBe(true);
  });
});
