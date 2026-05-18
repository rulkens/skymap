/**
 * poiSubsystem selection tests — verifies setSelectedPoi / getSelectedPoiId
 * round-trip plus the ringAlpha bump that the focus-mode pass relies on.
 *
 * The test fixtures use TWO distance regimes deliberately:
 *
 *   - The "far" POIs (`VIRGO`, `HERCULES`) sit well outside the marker
 *     fade-out band — their baseline ringAlpha is 1.0, so a 1.5× bump
 *     clamps right back to 1.0.  These cover the cap branch.
 *
 *   - The "fade-band" POI (`COMA`) is placed at a distance that puts
 *     its apparent ring radius squarely inside the 800–1000 px fade
 *     band, yielding a baseline ringAlpha around 0.5.  The 1.5× bump
 *     pushes that to ~0.75 without saturating — covers the multiply
 *     branch.
 *
 * Frame context mirrors the existing `poiSubsystem.test.ts` helper:
 * 1920×1080 viewport, 60° vertical FOV, camera at the origin.
 */

import { describe, expect, it } from 'vitest';
import { createPoiSubsystem, POI_STYLES } from '../../../../src/services/engine/subsystems/poiSubsystem';
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

// Far cluster — apparent ring radius far below 800 px, so baseline
// ringAlpha = 1.0.  Used to test the cap branch (1.5× saturates back
// to 1.0) and the unaffected-neighbour assertion.
const VIRGO: PointOfInterest = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [100, 0, 0],
  physicalRadiusMpc: 2,
};

const HERCULES: PointOfInterest = {
  id: 'hercules-sc',
  name: 'Hercules Supercluster',
  category: 'supercluster',
  worldPos: [200, 0, 0],
  physicalRadiusMpc: 25,
};

// Fade-band cluster — physRad 5 Mpc at distance 5.2 Mpc.  pxPerRad ≈
// 935.3, so apparentRadiusPx ≈ 5/5.2 × 935.3 ≈ 899.3.  That lands
// near the middle of the cluster fade band (800..1000 px), yielding
// baseline ringAlpha ≈ 0.505 — small enough that 1.5× ≈ 0.757 stays
// under the cap, so the assertion actually exercises the multiply.
const COMA: PointOfInterest = {
  id: 'coma',
  name: 'Coma Cluster',
  category: 'cluster',
  worldPos: [5.2, 0, 0],
  physicalRadiusMpc: 5,
};

describe('poiSubsystem selection', () => {
  it('starts with no POI selected', () => {
    const s = createPoiSubsystem();
    expect(s.getSelectedPoiId()).toBeNull();
  });

  it('records a selected POI id and reads it back', () => {
    const s = createPoiSubsystem();
    s.setPois([VIRGO, HERCULES]);
    s.setSelectedPoi('virgo-m87');
    expect(s.getSelectedPoiId()).toBe('virgo-m87');
  });

  it('clears selection when passed null', () => {
    const s = createPoiSubsystem();
    s.setPois([VIRGO]);
    s.setSelectedPoi('virgo-m87');
    s.setSelectedPoi(null);
    expect(s.getSelectedPoiId()).toBeNull();
  });

  it('ignores unknown POI ids (no-op rather than throw)', () => {
    const s = createPoiSubsystem();
    s.setPois([VIRGO]);
    s.setSelectedPoi('does-not-exist');
    expect(s.getSelectedPoiId()).toBeNull();
  });

  // At-rest ring alpha comes from POI_STYLES[category].ringColor[3]
  // since the move to baked Vec4 colours.  Tests compute their
  // expected values off these so style retuning (e.g. dropping
  // supercluster ringAlpha to 0.4) doesn't make them brittle.
  const CLUSTER_AT_REST_ALPHA = POI_STYLES.cluster.ringColor[3];
  const SC_AT_REST_ALPHA = POI_STYLES.supercluster.ringColor[3];

  it('does not change ringAlpha when no POI is selected', () => {
    const s = createPoiSubsystem();
    s.setPois([VIRGO, HERCULES]);
    const markers = s.produceMarkers(makeState(), makeCtx());
    const virgo = markers.find((m) => m.id === 'virgo-m87');
    const hercules = markers.find((m) => m.id === 'hercules-sc');
    expect(virgo).toBeDefined();
    expect(hercules).toBeDefined();
    expect(virgo!.ringColor[3]).toBeCloseTo(CLUSTER_AT_REST_ALPHA, 6);
    expect(hercules!.ringColor[3]).toBeCloseTo(SC_AT_REST_ALPHA, 6);
  });

  it('caps the selected POI ringAlpha at 1.0 when the bump exceeds 1', () => {
    const s = createPoiSubsystem();
    s.setPois([VIRGO, HERCULES]);
    s.setSelectedPoi('virgo-m87');
    const markers = s.produceMarkers(makeState(), makeCtx());
    const virgo = markers.find((m) => m.id === 'virgo-m87');
    const hercules = markers.find((m) => m.id === 'hercules-sc');
    // Selected: at-rest × 1.5, capped at 1.0.
    expect(virgo!.ringColor[3]).toBeCloseTo(Math.min(1, CLUSTER_AT_REST_ALPHA * 1.5), 6);
    // Not selected: at-rest, unchanged.
    expect(hercules!.ringColor[3]).toBeCloseTo(SC_AT_REST_ALPHA, 6);
  });

  it('multiplies the selected POI ringAlpha by 1.5x when not saturated, leaves neighbours alone', () => {
    const s = createPoiSubsystem();
    s.setPois([COMA, VIRGO]);
    // First measure Coma's baseline so the assertion below stays
    // honest if the fade-band tuning shifts in POI_STYLES.
    const baseline = s.produceMarkers(makeState(), makeCtx());
    const baselineComa = baseline.find((m) => m.id === 'coma');
    expect(baselineComa).toBeDefined();
    // Sanity: Coma sits inside the fade-out band, so its baseline
    // ringAlpha is strictly less than 1.  If this fails the test
    // distance needs re-tuning (POI_STYLES band moved, or pxPerRad
    // changed).
    expect(baselineComa!.ringColor[3]).toBeGreaterThan(0);
    expect(baselineComa!.ringColor[3]).toBeLessThan(1 / 1.5);

    s.setSelectedPoi('coma');
    const markers = s.produceMarkers(makeState(), makeCtx());
    const coma = markers.find((m) => m.id === 'coma');
    const virgo = markers.find((m) => m.id === 'virgo-m87');
    expect(coma).toBeDefined();
    expect(virgo).toBeDefined();
    expect(coma!.ringColor[3]).toBeCloseTo(Math.min(1, baselineComa!.ringColor[3] * 1.5), 6);
    expect(virgo!.ringColor[3]).toBeCloseTo(1, 6);
  });
});
