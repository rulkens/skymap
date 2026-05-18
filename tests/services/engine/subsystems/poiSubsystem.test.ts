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
  id: 'virgo',
  name: 'Virgo',
  category: 'cluster',
  worldPos: [-15.98, -2.13, 3.54],
  physicalRadiusMpc: 5,
};
const M31: PointOfInterest = {
  id: 'm31',
  name: 'Andromeda Galaxy',
  category: 'famousGalaxy',
  worldPos: [0.5, 0.1, 0.0],
  labelAnchorOffsetMpc: 0.05,
};
const BOOTES_VOID: PointOfInterest = {
  id: 'bootes',
  name: 'Boötes Void',
  category: 'void',
  worldPos: [200, 100, 50],
  physicalRadiusMpc: 20,
};
const LANIAKEA: PointOfInterest = {
  id: 'laniakea',
  name: 'Laniakea',
  category: 'supercluster',
  worldPos: [-50, -20, 10],
  physicalRadiusMpc: 25,
};

describe('poiSubsystem', () => {
  it('returns empty output when no POIs are set', () => {
    const sub = createPoiSubsystem();
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
    expect(out.awake).toBe(false);
  });

  it('emits one label per visible POI', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO, M31]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(2);
    expect(out.labels.map((l) => l.text)).toEqual(['Virgo', 'Andromeda Galaxy']);
  });

  it('emits a single vertical marker line for POIs with labelAnchorOffsetMpc', () => {
    const sub = createPoiSubsystem();
    const m31: PointOfInterest = {
      id: 'm31',
      name: 'Andromeda Galaxy',
      category: 'famousGalaxy',
      worldPos: [0.5, 0.1, 0.0],
      labelAnchorOffsetMpc: 0.1,
    };
    sub.setPois([m31]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]!.id).toBe('m31-anchor');
    // Same x and z as the POI; toWorld[1] is exactly 0.75 * offset above.
    expect(out.lines[0]!.fromWorld[0]).toBe(0.5);
    expect(out.lines[0]!.fromWorld[1]).toBe(0.1);
    expect(out.lines[0]!.fromWorld[2]).toBe(0.0);
    expect(out.lines[0]!.toWorld[0]).toBe(0.5);
    expect(out.lines[0]!.toWorld[1]).toBeCloseTo(0.1 + 0.075, 6);
    expect(out.lines[0]!.toWorld[2]).toBe(0.0);
  });

  it('lifts the label by exactly labelAnchorOffsetMpc and switches to alignX center', () => {
    const sub = createPoiSubsystem();
    const m31: PointOfInterest = {
      id: 'm31',
      name: 'Andromeda Galaxy',
      category: 'famousGalaxy',
      worldPos: [0.5, 0.1, 0.0],
      labelAnchorOffsetMpc: 0.05,
    };
    sub.setPois([m31]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0]!.worldPos[0]).toBe(0.5);
    expect(out.labels[0]!.worldPos[1]).toBeCloseTo(0.15, 6);
    expect(out.labels[0]!.worldPos[2]).toBe(0.0);
    expect(out.labels[0]!.alignX).toBe('center');
  });

  it('omits the anchor line and lift when labelAnchorOffsetMpc is absent (centres both axes)', () => {
    const sub = createPoiSubsystem();
    const galaxy: PointOfInterest = {
      id: 'no-anchor',
      name: 'NoAnchor',
      category: 'famousGalaxy',
      worldPos: [0.5, 0.1, 0.0],
      // labelAnchorOffsetMpc deliberately omitted
    };
    sub.setPois([galaxy]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels[0]!.worldPos[1]).toBe(0.1);
    // Labels without a lift offset centre on both axes so the text
    // sits symmetrically over the world anchor.
    expect(out.labels[0]!.alignX).toBe('center');
    expect(out.labels[0]!.alignY).toBe('center');
    expect(out.lines).toHaveLength(0);
  });

  it('cluster POIs centre both axes and emit no marker lines (crosshair removed)', () => {
    const sub = createPoiSubsystem();
    const virgo: PointOfInterest = {
      id: 'virgo',
      name: 'Virgo',
      category: 'cluster',
      worldPos: [-15.98, -2.13, 3.54],
      physicalRadiusMpc: 5,
    };
    sub.setPois([virgo]);
    const out = sub.produceLabels(makeState(), makeCtx());
    // Cluster/SC/void labels straddle the ring centre on both axes.
    expect(out.labels[0]!.alignX).toBe('center');
    expect(out.labels[0]!.alignY).toBe('center');
    expect(out.labels[0]!.worldPos[1]).toBe(-2.13); // not lifted
    // Pre-cluster-viz this would have been 3 (perpendicular crosshair).
    // Now: 0 — crosshair removed in plan 2/4 task 9; clusters render
    // as halo + ring via clusterMarkerRenderer instead.
    expect(out.lines).toHaveLength(0);
  });

  it('filters by category visibility', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO, M31, BOOTES_VOID, LANIAKEA]);
    sub.setCategoryVisible('famousGalaxy', false);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.text)).toEqual(['Virgo', 'Boötes Void', 'Laniakea']);
  });

  it('accepts the supercluster category and styles it from POI_STYLES.supercluster', () => {
    const sub = createPoiSubsystem();
    sub.setPois([LANIAKEA]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0]!.text).toBe('Laniakea');
  });

  it('setPois replaces the list immutably (does not mutate input)', () => {
    const sub = createPoiSubsystem();
    const initial = [VIRGO];
    sub.setPois(initial);
    sub.setPois([M31]);
    expect(initial).toEqual([VIRGO]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.text)).toEqual(['Andromeda Galaxy']);
  });

  it('has stable id "pois"', () => {
    expect(createPoiSubsystem().id).toBe('pois');
  });

  // ── Apparent-size gating ─────────────────────────────────────────
  //
  // `minApparentSizePx` lets a POI suppress emission when its physical
  // extent (passed via `apparentDiameterKpc`) projects to fewer screen
  // pixels than the threshold.  Cluster/supercluster/void anchors
  // omit the field and always emit; Famous galaxies set it so
  // far-away tiny galaxies don't clutter the view.
  it('emits a POI with minApparentSizePx when projected size meets the threshold', () => {
    const sub = createPoiSubsystem();
    // Galaxy 1 Mpc away with 50 kpc diameter under a 60° fovY at
    // 1080 px viewport: angular = 50 / (1 * 1000) = 0.05 rad.  pxPerRad
    // = 1080 / (2*tan(30°)) ≈ 935.  apparentSizePx ≈ 46.7 px — well above
    // any reasonable threshold.
    const close: PointOfInterest = {
      id: 'close',
      name: 'Close',
      category: 'famousGalaxy',
      worldPos: [1, 0, 0],
      minApparentSizePx: 6,
      apparentDiameterKpc: 50,
    };
    sub.setPois([close]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['close']);
  });

  it('suppresses a POI when projected size falls below minApparentSizePx', () => {
    const sub = createPoiSubsystem();
    // Galaxy 500 Mpc away with 30 kpc diameter under the same camera:
    // angular = 30 / (500 * 1000) = 6e-5 rad.  apparentSizePx ≈ 0.056 px
    // — way below the 6 px threshold.
    const far: PointOfInterest = {
      id: 'far',
      name: 'Far',
      category: 'famousGalaxy',
      worldPos: [500, 0, 0],
      minApparentSizePx: 6,
      apparentDiameterKpc: 30,
    };
    sub.setPois([far]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('emits a POI without minApparentSizePx unconditionally', () => {
    const sub = createPoiSubsystem();
    // 500 Mpc away — would be suppressed if a threshold were set,
    // but the field is absent so the producer skips the gate.
    const noGate: PointOfInterest = {
      id: 'no-gate',
      name: 'NoGate',
      category: 'cluster',
      worldPos: [500, 0, 0],
    };
    sub.setPois([noGate]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['no-gate']);
  });

  it('emits a POI with minApparentSizePx but no apparentDiameterKpc unconditionally', () => {
    // Defensive default: if the consumer set a threshold but forgot to
    // provide a diameter, fall through (better to over-emit than to
    // silently hide a POI the consumer thought they configured).
    const sub = createPoiSubsystem();
    const partial: PointOfInterest = {
      id: 'partial',
      name: 'Partial',
      category: 'famousGalaxy',
      worldPos: [500, 0, 0],
      minApparentSizePx: 6,
    };
    sub.setPois([partial]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['partial']);
  });

  it('smoothsteps fadeAlpha through the famousGalaxy fade band', () => {
    // 30 kpc galaxy at 4 Mpc: angular = 30 / 4000 = 0.0075 rad.
    // pxPerRad ≈ 935 → sizePx ≈ 7.02 → in the fade band
    // [6, 10] (minApparentSizePx=6, fadeBandPx=4).  Smoothstep over
    // t = (7.02 - 6) / 4 ≈ 0.255 gives ~0.162 — strictly inside (0,1).
    const sub = createPoiSubsystem();
    const m: PointOfInterest = {
      id: 'mid-fade',
      name: 'MidFade',
      category: 'famousGalaxy',
      worldPos: [4, 0, 0],
      minApparentSizePx: 6,
      apparentDiameterKpc: 30,
    };
    sub.setPois([m]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(1);
    const fade = out.labels[0]!.fadeAlpha ?? 1;
    expect(fade).toBeGreaterThan(0);
    expect(fade).toBeLessThan(1);
    expect(out.awake).toBe(true);
  });

  it('returns awake: false when no POI is mid-fade', () => {
    const sub = createPoiSubsystem();
    const big: PointOfInterest = {
      id: 'big',
      name: 'Big',
      category: 'famousGalaxy',
      worldPos: [1, 0, 0],
      minApparentSizePx: 6,
      apparentDiameterKpc: 50, // ~47 px — far above the fade band
    };
    sub.setPois([big]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.awake).toBe(false);
    expect(out.labels[0]!.fadeAlpha).toBe(1);
  });
});

describe('poiSubsystem — crosshair removal', () => {
  it('produces zero marker-lines for a cluster POI with no labelAnchorOffsetMpc', () => {
    const sub = createPoiSubsystem();
    const poi: PointOfInterest = {
      id: 'virgo',
      name: 'Virgo',
      category: 'cluster',
      worldPos: [10, 0, 0],
      physicalRadiusMpc: 2,
    };
    sub.setPois([poi]);
    const out = sub.produceLabels(makeState(), makeCtx());
    // Pre-cluster-viz this would have been 3 (three perpendicular
    // crosshair lines).  Now: 0, because the cluster has no
    // labelAnchorOffsetMpc and the crosshair is gone.
    expect(out.lines).toHaveLength(0);
    // Label is still produced.
    expect(out.labels).toHaveLength(1);
  });
});

describe('poiSubsystem — produceMarkers', () => {
  it('returns one descriptor per visible cluster + supercluster + void POI', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      { id: 'virgo', name: 'Virgo', category: 'cluster',
        worldPos: [10, 0, 0], physicalRadiusMpc: 2 },
      { id: 'hercules', name: 'Hercules SC', category: 'supercluster',
        worldPos: [0, 100, 0], physicalRadiusMpc: 50 },
      { id: 'bootes', name: 'Boötes Void', category: 'void',
        worldPos: [0, 0, 200], physicalRadiusMpc: 50 },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(3);
  });

  it('excludes famous-galaxy POIs from markers', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      { id: 'm31', name: 'M31', category: 'famousGalaxy',
        worldPos: [0.78, 0, 0], physicalRadiusMpc: 0.05 },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(0);
  });

  it('voids emit both halo and ring (halo at the dimmer at-rest alpha from the style)', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      { id: 'bootes', name: 'Boötes Void', category: 'void',
        worldPos: [0, 0, 200], physicalRadiusMpc: 50 },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers[0]?.haloColor[3]).toBeGreaterThan(0);
    expect(markers[0]?.ringColor[3]).toBeGreaterThan(0);
    // Void halo is intentionally quieter than the ring — at-rest
    // style alpha ≈ 0.65 vs ring's 1.0.
    expect(markers[0]?.haloColor[3]).toBeLessThan(markers[0]!.ringColor[3]);
  });

  it('respects setCategoryVisible', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      { id: 'virgo', name: 'Virgo', category: 'cluster',
        worldPos: [10, 0, 0], physicalRadiusMpc: 2 },
      { id: 'bootes', name: 'Boötes Void', category: 'void',
        worldPos: [0, 0, 200], physicalRadiusMpc: 50 },
    ]);
    sub.setCategoryVisible('void', false);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(1);
    expect(markers[0]?.category).toBe('cluster');
  });

  it('skips POIs without physicalRadiusMpc', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      // No physicalRadiusMpc — should not appear in markers (no
      // radius to draw to).
      { id: 'unsized', name: 'Unsized', category: 'cluster',
        worldPos: [10, 0, 0] },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(0);
  });
});

describe('poiSubsystem — produceLabels awake propagation', () => {
  it('produceLabels sets awake=true when a marker is mid-fade-out', () => {
    const sub = createPoiSubsystem();
    // Put the camera so close to a small-radius cluster that the projected
    // ring lands inside the markerMaxApparentFadeBandPx fade band.  At
    // distance d the apparent radius is (r / d) * pxPerRad; we want it
    // between 800 and 1000 (markerMaxApparentRadiusPx=800,
    // markerMaxApparentFadeBandPx=200) given pxPerRad=500 and r=2:
    //   target = 850 → d = (2 / 850) * 500 = ~1.18
    sub.setPois([
      { id: 'virgo', name: 'Virgo', category: 'cluster',
        worldPos: [1.18, 0, 0], physicalRadiusMpc: 2 },
    ]);
    const ctx = {
      drawCamPos: [0, 0, 0],
      canvasSize: { width: 1024, height: 768 },
      drawPxPerRad: 500,
    } as unknown as ReadyFrameContext;
    const out = sub.produceLabels(makeState(), ctx);
    expect(out.awake).toBe(true);
  });
});
