/**
 * poiSubsystem hover tests — verifies setHoveredPoi / getHoveredPoiId
 * round-trip and the LOAD-BEARING regression that hover does NOT bump
 * `ringAlpha` (the visual contract that distinguishes hover from
 * selection).
 *
 * Mirrors the structure of `poiSubsystem.selection.test.ts`.  The
 * frame-context helpers below replicate the canonical stub shape from
 * the selection test file (1920×1080 viewport, 60° vertical FOV,
 * camera at the origin) so the ringAlpha-comparison assertion exercises
 * the same code path produceMarkers runs in production.
 *
 * Why the regression assertion is the heart of this file: the hard
 * constraint of plan 5 is "no ring appearance change on hover".  If a
 * future implementer adds a hover branch to produceMarkers, this test
 * fails loudly with a mismatch between the hovered and not-hovered
 * ringAlpha — exactly the visual side effect the plan forbids.
 */

import { describe, expect, it } from 'vitest';
import { createPoiSubsystem } from '../../../../src/services/engine/subsystems/poiSubsystem';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeState(): EngineState {
  return {
    subsystems: {
      scheduler: { requestRender: () => {} },
      fades: { fadeTo: () => Promise.resolve() },
    },
  } as unknown as EngineState;
}

function makeCtx(): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, 0],
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
  } as unknown as ReadyFrameContext;
}

const VIRGO: PointOfInterest = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [100, 0, 0],
  physicalRadiusMpc: 2,
};

const COMA: PointOfInterest = {
  id: 'coma',
  name: 'Coma Cluster',
  category: 'cluster',
  worldPos: [150, 0, 0],
  physicalRadiusMpc: 6,
};

describe('poiSubsystem.setHoveredPoi', () => {
  it('starts with no hovered POI', () => {
    const s = createPoiSubsystem();
    expect(s.getHoveredPoiId()).toBeNull();
  });

  it('records the hovered POI id when set', () => {
    const s = createPoiSubsystem();
    s.setPois([VIRGO, COMA]);
    s.setHoveredPoi('virgo-m87');
    expect(s.getHoveredPoiId()).toBe('virgo-m87');
  });

  it('clears hovered POI when passed null', () => {
    const s = createPoiSubsystem();
    s.setPois([VIRGO]);
    s.setHoveredPoi('virgo-m87');
    s.setHoveredPoi(null);
    expect(s.getHoveredPoiId()).toBeNull();
  });

  it('ignores unknown ids (defensive against tier-swap races)', () => {
    const s = createPoiSubsystem();
    s.setPois([VIRGO]);
    s.setHoveredPoi('does-not-exist');
    expect(s.getHoveredPoiId()).toBeNull();
  });

  it('coexists with setSelectedPoi without interfering', () => {
    const s = createPoiSubsystem();
    s.setPois([VIRGO, COMA]);
    s.setSelectedPoi('virgo-m87');
    s.setHoveredPoi('coma');
    expect(s.getSelectedPoiId()).toBe('virgo-m87');
    expect(s.getHoveredPoiId()).toBe('coma');
  });

  // LOAD-BEARING regression: hover MUST NOT bump ringAlpha.  This is
  // the visual contract that separates hover from selection in plan 5.
  // If a future implementer adds a hover branch to produceMarkers,
  // this assertion will fail with the bumped value vs the baseline.
  it('does NOT bump ringAlpha when only hovered (vs selected)', () => {
    const s = createPoiSubsystem();
    s.setPois([VIRGO]);

    // Baseline: nothing hovered, nothing selected.
    const baseline = s.produceMarkers(makeState(), makeCtx());
    expect(baseline).toHaveLength(1);
    const baselineMarker = baseline[0];
    expect(baselineMarker).toBeDefined();
    const baselineAlpha = baselineMarker!.ringAlpha;

    // Hover Virgo — ringAlpha must be identical to the baseline.
    s.setHoveredPoi('virgo-m87');
    const hovered = s.produceMarkers(makeState(), makeCtx());
    expect(hovered).toHaveLength(1);
    const hoveredMarker = hovered[0];
    expect(hoveredMarker).toBeDefined();
    expect(hoveredMarker!.ringAlpha).toBeCloseTo(baselineAlpha, 6);
  });
});
