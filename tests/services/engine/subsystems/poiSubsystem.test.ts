import { describe, expect, it } from 'vitest';
import { mat4 } from 'gl-matrix';
import {
  createPoiSubsystem,
  POI_STYLES,
} from '../../../../src/services/engine/subsystems/poiSubsystem';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeState(selectedPoiId: string | null = null): EngineState {
  return {
    subsystems: {
      scheduler: { requestRender: () => {} },
      fades: { fadeTo: () => Promise.resolve() },
      selection: {
        selected: () => (selectedPoiId !== null ? { kind: 'poi', id: selectedPoiId } : null),
      },
    },
  } as unknown as EngineState;
}
function makeCtx(vp: mat4 = mat4.create()): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, 0],
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
    vp,
  } as unknown as ReadyFrameContext;
}

const VIRGO: PointOfInterest = {
  id: 'virgo',
  name: 'Virgo',
  category: 'cluster',
  worldPos: [-15.98, -2.13, 3.54],
  featured: true,
  physicalRadiusMpc: 5,
};
const M31: PointOfInterest = {
  id: 'm31',
  name: 'Andromeda Galaxy',
  category: 'famousGalaxy',
  worldPos: [0.5, 0.1, 0.0],
  featured: true,
  labelAnchorOffsetMpc: 0.05,
};
const BOOTES_VOID: PointOfInterest = {
  id: 'bootes',
  name: 'Boötes Void',
  category: 'void',
  worldPos: [200, 100, 50],
  featured: true,
  physicalRadiusMpc: 20,
};
const LANIAKEA: PointOfInterest = {
  id: 'laniakea',
  name: 'Laniakea',
  category: 'supercluster',
  worldPos: [-50, -20, 10],
  featured: true,
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
      featured: true,
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
      featured: true,
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
      featured: true,
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
      featured: true,
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

  it('filters by label-axis category visibility', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO, M31, BOOTES_VOID, LANIAKEA]);
    sub.setCategoryLabelVisible('famousGalaxy', false);
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
      featured: true,
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
      featured: true,
      minApparentSizePx: 6,
      apparentDiameterKpc: 30,
    };
    sub.setPois([far]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('emits a famous-galaxy POI without minApparentSizePx unconditionally', () => {
    const sub = createPoiSubsystem();
    // 500 Mpc away — would be suppressed if a threshold were set, but the
    // field is absent so the producer skips the gate.  famousGalaxy is the
    // arm that legitimately omits both the size gate and any radius.
    const noGate: PointOfInterest = {
      id: 'no-gate',
      name: 'NoGate',
      category: 'famousGalaxy',
      worldPos: [500, 0, 0],
      featured: true,
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
      featured: true,
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
      featured: true,
      minApparentSizePx: 6,
      apparentDiameterKpc: 30,
    };
    sub.setPois([m]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(1);
    const fade = out.labels[0]!.fadeAlpha ?? 1;
    expect(fade).toBeGreaterThan(0);
    expect(fade).toBeLessThan(1);
    // awake stays false even mid-fade: fadeAlpha is camera-distance-driven,
    // so any change is already covered by the camera-motion wake sources.
    expect(out.awake).toBe(false);
  });

  it('reports awake: false above the fade band (fadeAlpha == 1)', () => {
    const sub = createPoiSubsystem();
    const big: PointOfInterest = {
      id: 'big',
      name: 'Big',
      category: 'famousGalaxy',
      worldPos: [1, 0, 0],
      featured: true,
      minApparentSizePx: 6,
      apparentDiameterKpc: 50, // ~47 px — far above the fade band
    };
    sub.setPois([big]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.awake).toBe(false);
    expect(out.labels[0]!.fadeAlpha).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Featured gate + screen-space declutter (Plan 2 / Task 7)
//
// After Task 5 the ~375 bulk cluster/SC POIs sit in the POI list with
// `featured: false`; labelling them all is noise.  produceLabels now
// (1) gates on `featured` so only the ~25-30 curated anchors + famous
// galaxies get labels, and (2) runs an O(n²) greedy declutter over the
// surviving candidates keeping the higher-significance label when two
// project to overlapping screen boxes.
//
// Projection uses an identity `vp` here: clip.w == 1, so a worldPos
// [wx, wy, wz] projects to NDC == [wx, wy, wz] and then to screen px
// via the producer's (ndc*0.5+0.5)*size mapping (Y flipped).  Clusters
// sit at distance ~5 Mpc with radius 2 Mpc → apRadPx ≈ 374, squarely
// in the flat marker zone, so the only thing that decides survival is
// the declutter overlap test.
// ─────────────────────────────────────────────────────────────────────
describe('poiSubsystem · featured gate + declutter', () => {
  it('emits no label for a non-featured POI (markers still emit)', () => {
    const sub = createPoiSubsystem();
    const bulk: PointOfInterest = {
      id: 'bulk-cluster',
      name: 'Bulk Cluster',
      category: 'cluster',
      worldPos: [0, 0, 5],
      featured: false,
      physicalRadiusMpc: 2,
      significance: 0.5,
    };
    sub.setPois([bulk]);
    const out = sub.produceLabels(makeState(), makeCtx());
    const markers = sub.produceMarkers(makeState(), makeCtx());
    // Bulk POIs render as markers (rings/halos) but get NO label.
    expect(out.labels).toEqual([]);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.id).toBe('bulk-cluster');
  });

  it('still labels a featured POI', () => {
    const sub = createPoiSubsystem();
    const featured: PointOfInterest = {
      id: 'coma',
      name: 'Coma',
      category: 'cluster',
      worldPos: [0, 0, 5],
      featured: true,
      physicalRadiusMpc: 2,
    };
    sub.setPois([featured]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.text)).toEqual(['Coma']);
  });

  it('declutters overlapping featured labels keeping the higher significance', () => {
    const sub = createPoiSubsystem();
    // Both project to ~screen centre (960, 540) under identity vp — well
    // within DECLUTTER_MARGIN_PX of each other in both x and y.
    const faint: PointOfInterest = {
      id: 'faint',
      name: 'Faint',
      category: 'cluster',
      worldPos: [0, 0, 5],
      featured: true,
      physicalRadiusMpc: 2,
      significance: 0.2,
    };
    const bright: PointOfInterest = {
      id: 'bright',
      name: 'Bright',
      category: 'cluster',
      worldPos: [0.01, 0, 5],
      featured: true,
      physicalRadiusMpc: 2,
      significance: 0.9,
    };
    sub.setPois([faint, bright]);
    const out = sub.produceLabels(makeState(), makeCtx());
    // Only the higher-significance label survives the overlap.
    expect(out.labels.map((l) => l.id)).toEqual(['bright']);
  });

  it('keeps non-overlapping featured labels both', () => {
    const sub = createPoiSubsystem();
    // Project far apart in screen X: [-0.5] → 480 px, [0.5] → 1440 px,
    // ~960 px apart, well beyond DECLUTTER_MARGIN_PX.
    const left: PointOfInterest = {
      id: 'left',
      name: 'Left',
      category: 'cluster',
      worldPos: [-0.5, 0, 5],
      featured: true,
      physicalRadiusMpc: 2,
      significance: 0.9,
    };
    const right: PointOfInterest = {
      id: 'right',
      name: 'Right',
      category: 'cluster',
      worldPos: [0.5, 0, 5],
      featured: true,
      physicalRadiusMpc: 2,
      significance: 0.2,
    };
    sub.setPois([left, right]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.id).sort()).toEqual(['left', 'right']);
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
      featured: true,
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
      {
        id: 'virgo',
        name: 'Virgo',
        category: 'cluster',
        featured: true,
        worldPos: [10, 0, 0],
        physicalRadiusMpc: 2,
      },
      {
        id: 'hercules',
        name: 'Hercules SC',
        category: 'supercluster',
        featured: true,
        worldPos: [0, 100, 0],
        physicalRadiusMpc: 50,
      },
      {
        id: 'bootes',
        name: 'Boötes Void',
        category: 'void',
        featured: true,
        worldPos: [0, 0, 200],
        physicalRadiusMpc: 50,
      },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(3);
  });

  it('excludes famous-galaxy POIs from markers', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      { id: 'm31', name: 'M31', category: 'famousGalaxy', featured: true, worldPos: [0.78, 0, 0] },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(0);
  });

  it('voids emit both halo and ring (halo at the dimmer at-rest alpha from the style)', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      {
        id: 'bootes',
        name: 'Boötes Void',
        category: 'void',
        featured: true,
        worldPos: [0, 0, 200],
        physicalRadiusMpc: 50,
      },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers[0]?.haloColor[3]).toBeGreaterThan(0);
    expect(markers[0]?.ringColor[3]).toBeGreaterThan(0);
    // Void halo is intentionally quieter than the ring — at-rest
    // style alpha ≈ 0.65 vs ring's 1.0.
    expect(markers[0]?.haloColor[3]).toBeLessThan(markers[0]!.ringColor[3]);
  });

  // ── Significance weighting (Plan 2 / Task 6) ──────────────────────
  //
  // produceMarkers folds a per-POI significance factor into the baked
  // halo + ring alpha so low-significance distant structures stay faint
  // ("structure, not fog").  The distance-fade math is unchanged; this
  // multiplies an ADDITIONAL factor in.  Both POIs below sit at the same
  // distance/radius so their distance fades are equal — radius 2 Mpc at
  // 10 Mpc → apRadPx ≈ 187 px, squarely inside the flat full-alpha zone
  // (above the 24 px floor band, below the 700 px ceiling), so the only
  // difference between the two descriptors is the significance weight.
  it('dims a low-significance POI relative to a high one', () => {
    const sub = createPoiSubsystem();
    const faint: PointOfInterest = {
      id: 'faint',
      name: 'Faint',
      category: 'cluster',
      featured: true,
      worldPos: [10, 0, 0],
      physicalRadiusMpc: 2,
      significance: 0.1,
    };
    const bright: PointOfInterest = {
      id: 'bright',
      name: 'Bright',
      category: 'cluster',
      featured: true,
      worldPos: [-10, 0, 0],
      physicalRadiusMpc: 2,
      significance: 1.0,
    };
    sub.setPois([faint, bright]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(2);
    const faintM = markers.find((m) => m.id === 'faint')!;
    const brightM = markers.find((m) => m.id === 'bright')!;
    expect(faintM.ringColor[3]).toBeLessThan(brightM.ringColor[3]);
    expect(faintM.haloColor[3]).toBeLessThan(brightM.haloColor[3]);
  });

  it('leaves featured anchors (significance undefined) at full weight', () => {
    const sub = createPoiSubsystem();
    // significance omitted → sigWeight falls back to 1 (?? 1), identical
    // to an explicit significance: 1.  This guards the `?? 1` fallback so
    // pre-existing fixtures without significance keep full-weight alpha.
    const omitted: PointOfInterest = {
      id: 'omitted',
      name: 'Omitted',
      category: 'cluster',
      featured: true,
      worldPos: [10, 0, 0],
      physicalRadiusMpc: 2,
    };
    const explicitOne: PointOfInterest = {
      id: 'explicit',
      name: 'Explicit',
      category: 'cluster',
      featured: true,
      worldPos: [-10, 0, 0],
      physicalRadiusMpc: 2,
      significance: 1,
    };
    sub.setPois([omitted, explicitOne]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    const omittedM = markers.find((m) => m.id === 'omitted')!;
    const explicitM = markers.find((m) => m.id === 'explicit')!;
    expect(omittedM.ringColor[3]).toBeCloseTo(explicitM.ringColor[3], 10);
    expect(omittedM.haloColor[3]).toBeCloseTo(explicitM.haloColor[3], 10);
    // Both at full weight: ringColor at-rest alpha (1.0) × full distance
    // fade (1.0) × sigWeight (1.0) = 1.0.
    expect(omittedM.ringColor[3]).toBeCloseTo(1, 5);
  });

  // ── Pick-index alignment under fade (emit-all, discard-in-fragment) ──
  //
  // The ring pick path packs `@builtin(instance_index)` as the per-
  // category-local POI index, which `resolvePoiFromPick` resolves via
  // `getPoisForCategory(cat)[poiIndex]`.  For that lookup to land on the
  // right structure, `produceMarkers` MUST emit exactly one descriptor
  // per marker-bearing POI of a visible category — even ones faded fully
  // out — so the descriptor's position in its category run equals the
  // POI's position in `getPoisForCategory`.  A faded POI emits an
  // alpha-0 descriptor (invisible, discarded in-fragment) rather than
  // being omitted; omitting it would index-shift every later POI and
  // select the wrong structure on click/hover.
  it('keeps a faded-out POI in its descriptor slot at alpha 0 (pick-index alignment)', () => {
    const sub = createPoiSubsystem();
    // First cluster fades fully OUT: tiny radius far away → apRadPx well
    // below the cluster floor (12 px).  radius=1, distance=500 → apRadPx
    // ≈ 1.87 px.  Second cluster is comfortably visible (apRadPx ≈ 187).
    const fadedOut: PointOfInterest = {
      id: 'faded-out',
      name: 'FadedOut',
      category: 'cluster',
      featured: true,
      worldPos: [500, 0, 0],
      physicalRadiusMpc: 1,
    };
    const visible: PointOfInterest = {
      id: 'visible',
      name: 'Visible',
      category: 'cluster',
      featured: true,
      worldPos: [10, 0, 0],
      physicalRadiusMpc: 2,
    };
    sub.setPois([fadedOut, visible]);
    const markers = sub.produceMarkers(makeState(), makeCtx());

    // Per-category descriptor order, mapped to id, EQUALS
    // getPoisForCategory order — independent of fade.  This is the
    // invariant the ring-pick instance_index relies on.
    const clusterDescriptorIds = markers
      .filter((m) => m.category === 'cluster')
      .map((m) => m.id);
    const expected = sub.getPoisForCategory('cluster').map((p) => p.id);
    expect(clusterDescriptorIds).toEqual(expected);
    expect(clusterDescriptorIds).toEqual(['faded-out', 'visible']);

    // The faded-out POI still occupies slot 0, at alpha 0 (so the ring +
    // halo fragments discard it and the pick fragment skips it).
    const fadedM = markers.find((m) => m.id === 'faded-out')!;
    expect(fadedM.ringColor[3]).toBe(0);
    expect(fadedM.haloColor[3]).toBe(0);
    // The visible POI keeps full alpha.
    const visibleM = markers.find((m) => m.id === 'visible')!;
    expect(visibleM.ringColor[3]).toBeGreaterThan(0);
  });

  it('respects setCategoryMarkerVisible', () => {
    const sub = createPoiSubsystem();
    sub.setPois([
      {
        id: 'virgo',
        name: 'Virgo',
        category: 'cluster',
        featured: true,
        worldPos: [10, 0, 0],
        physicalRadiusMpc: 2,
      },
      {
        id: 'bootes',
        name: 'Boötes Void',
        category: 'void',
        featured: true,
        worldPos: [0, 0, 200],
        physicalRadiusMpc: 50,
      },
    ]);
    sub.setCategoryMarkerVisible('void', false);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(1);
    expect(markers[0]?.category).toBe('cluster');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Far-distance fade-out (the symmetric counterpart to the existing
// markerMaxApparentRadiusPx close-approach fade).  Below
// markerMinApparentRadiusPx the descriptor is dropped; inside the
// band it smoothsteps 0 → 1.  Labels mirror the same math so they
// fade together with their rings rather than orphaning floating text.
//
// pxPerRad ≈ 935.307 at the test ctx (60° fovY, 1080 px height), so
// apparentRadiusPx ≈ (radiusMpc / distanceMpc) * 935.307.
// ─────────────────────────────────────────────────────────────────────
describe('poiSubsystem — far-distance marker fade-out', () => {
  it('cluster: emits an invisible (alpha-0) descriptor below the apparent-radius floor', () => {
    // radiusMpc=1, distance=150 Mpc → apRadPx ≈ 6.2 < cluster floor (12).
    // The marker is invisible, but the descriptor is retained at alpha 0
    // so the ring-pick instance_index stays aligned with
    // getPoisForCategory (see the produceMarkers loop header).
    const sub = createPoiSubsystem();
    sub.setPois([
      {
        id: 'tiny',
        name: 'Tiny',
        category: 'cluster',
        featured: true,
        worldPos: [150, 0, 0],
        physicalRadiusMpc: 1,
      },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(1);
    expect(markers[0]!.ringColor[3]).toBe(0);
    expect(markers[0]!.haloColor[3]).toBe(0);
  });

  it('cluster: smoothsteps fadeAlpha at the band midpoint', () => {
    // Want apRadPx = floor + band/2 = 12 + 6 = 18.
    // radiusMpc=1, distance = 935.307 / 18 ≈ 51.96 Mpc.
    const sub = createPoiSubsystem();
    sub.setPois([
      {
        id: 'midband',
        name: 'Mid',
        category: 'cluster',
        featured: true,
        worldPos: [51.96, 0, 0],
        physicalRadiusMpc: 1,
      },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(1);
    // smoothstep(0.5) === 0.5; ringColor's at-rest alpha is 1 in hexToGl('#B39947').
    // ringAlpha = atRest * fadeAlpha = 1 * 0.5.
    expect(markers[0]!.ringColor[3]).toBeCloseTo(0.5, 2);
  });

  it('cluster: full alpha above the band', () => {
    // worldPos=[10,0,0], radius=2 → apRadPx ≈ 187, well above 24.
    const sub = createPoiSubsystem();
    sub.setPois([
      {
        id: 'big',
        name: 'Big',
        category: 'cluster',
        featured: true,
        worldPos: [10, 0, 0],
        physicalRadiusMpc: 2,
      },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(1);
    expect(markers[0]!.ringColor[3]).toBeCloseTo(1, 5);
  });

  it('supercluster: emits an invisible (alpha-0) descriptor below its (higher) floor of 28 px', () => {
    // radiusMpc=1, distance=200 → apRadPx ≈ 4.7 < 28.  Invisible, but the
    // descriptor is retained at alpha 0 for pick-index alignment.
    const sub = createPoiSubsystem();
    sub.setPois([
      {
        id: 'sc-far',
        name: 'Far SC',
        category: 'supercluster',
        featured: true,
        worldPos: [200, 0, 0],
        physicalRadiusMpc: 1,
      },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(1);
    expect(markers[0]!.ringColor[3]).toBe(0);
    expect(markers[0]!.haloColor[3]).toBe(0);
  });

  it('void: emits an invisible (alpha-0) descriptor below its floor of 28 px', () => {
    // radiusMpc=1, distance=500 → apRadPx ≈ 1.87 < 28.  Invisible, but the
    // descriptor is retained at alpha 0 for pick-index alignment.
    const sub = createPoiSubsystem();
    sub.setPois([
      {
        id: 'void-far',
        name: 'Far Void',
        category: 'void',
        featured: true,
        worldPos: [500, 0, 0],
        physicalRadiusMpc: 1,
      },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    expect(markers).toHaveLength(1);
    expect(markers[0]!.ringColor[3]).toBe(0);
    expect(markers[0]!.haloColor[3]).toBe(0);
  });

  it('label fadeAlpha matches marker alpha at the band midpoint', () => {
    // Same mid-band cluster scenario as the smoothstep test above —
    // the label produced by produceLabels should fade in lockstep with
    // the ring rather than lingering at full alpha.
    const sub = createPoiSubsystem();
    sub.setPois([
      {
        id: 'midband',
        name: 'Mid',
        category: 'cluster',
        featured: true,
        worldPos: [51.96, 0, 0],
        physicalRadiusMpc: 1,
      },
    ]);
    const markers = sub.produceMarkers(makeState(), makeCtx());
    const labels = sub.produceLabels(makeState(), makeCtx()).labels;
    expect(markers).toHaveLength(1);
    expect(labels).toHaveLength(1);
    // ringAlpha already includes the at-rest style alpha (1.0 for
    // cluster) × fadeAlpha; label.fadeAlpha is the bare fade factor.
    expect(labels[0]!.fadeAlpha).toBeCloseTo(markers[0]!.ringColor[3], 5);
  });

  it('famous galaxies are unaffected by the new ring-radius floor', () => {
    // Famous galaxies skip produceMarkers (haloColor === null) and don't
    // set physicalRadiusMpc → the apRadPx branch in produceLabels is
    // also skipped.  The label should still emit at the camera distance
    // the existing min-apparent-size tests use.
    const sub = createPoiSubsystem();
    sub.setPois([
      {
        id: 'm31',
        name: 'Andromeda',
        category: 'famousGalaxy',
        featured: true,
        worldPos: [0.78, 0, 0],
        minApparentSizePx: 4,
        apparentDiameterKpc: 50,
      },
    ]);
    const labels = sub.produceLabels(makeState(), makeCtx()).labels;
    expect(labels).toHaveLength(1);
  });
});

// Note: a former "produceLabels awake propagation" block asserted that
// the marker close-approach fade-out set awake=true while mid-band.
// That contract was reversed by main's #146 ("drop spurious 'awake'
// flag from label producers") — the fade is a pure function of camera
// distance, and camera motion already wakes the loop via tweens /
// spaceMouse / pointer events.  Setting awake mid-band would pin the
// render loop on while a POI happens to be mid-fade.

// ─────────────────────────────────────────────────────────────────────
// Marker vs label visibility records (audit Q11, 2026-05-19) +
// anchor gate (2026-05-19 follow-up)
//
// Two underlying records (`markerVisibility`, `labelVisibility`) gate
// the two outputs independently in the data model — flipping a label
// record never mutates the marker record, and vice versa.  At RENDER
// time, however, a structure label (cluster / supercluster / void) is
// also gated on its marker being visible: a floating label with no
// ring anchor reads as orphan text in space.  `famousGalaxy` labels
// are exempt — their anchor is the galaxy point itself, not a ring.
// ─────────────────────────────────────────────────────────────────────
describe('poiSubsystem · marker/label visibility', () => {
  // Cluster with a ring (physicalRadiusMpc set → marker is emitted)
  // and a name (label is emitted).  Both axes default to visible.
  const VIRGO_WITH_RING: PointOfInterest = {
    id: 'virgo',
    name: 'Virgo',
    category: 'cluster',
    worldPos: [10, 0, 0],
    featured: true,
    physicalRadiusMpc: 2,
  };

  it('setCategoryMarkerVisible(false) hides the marker AND the structure-category label (anchor gate)', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO_WITH_RING]);
    sub.setCategoryMarkerVisible('cluster', false);

    const labels = sub.produceLabels(makeState(), makeCtx()).labels;
    const markers = sub.produceMarkers(makeState(), makeCtx());

    // Anchor gate: a cluster label without its ring would float with
    // no visual reference, so the render path drops it too.
    expect(labels).toHaveLength(0);
    expect(markers).toHaveLength(0);
  });

  it('famousGalaxy labels are exempt from the anchor gate', () => {
    const sub = createPoiSubsystem();
    const m31: PointOfInterest = {
      id: 'm31',
      name: 'Andromeda Galaxy',
      category: 'famousGalaxy',
      worldPos: [0, 0, 5],
      featured: true,
    };
    sub.setPois([m31]);
    sub.setCategoryMarkerVisible('famousGalaxy', false);

    const labels = sub.produceLabels(makeState(), makeCtx()).labels;

    // famousGalaxy has no ring marker — its anchor is the galaxy point
    // itself, so the marker-axis flip doesn't gate its label.
    expect(labels.map((l) => l.text)).toEqual(['Andromeda Galaxy']);
  });

  it('setCategoryLabelVisible(false) hides only the label, not the marker', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO_WITH_RING]);
    sub.setCategoryLabelVisible('cluster', false);

    const labels = sub.produceLabels(makeState(), makeCtx()).labels;
    const markers = sub.produceMarkers(makeState(), makeCtx());

    expect(labels).toHaveLength(0);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.category).toBe('cluster');
  });

  it('setting both axes to false hides both the marker and the label', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO_WITH_RING]);
    sub.setCategoryMarkerVisible('cluster', false);
    sub.setCategoryLabelVisible('cluster', false);

    const labels = sub.produceLabels(makeState(), makeCtx()).labels;
    const markers = sub.produceMarkers(makeState(), makeCtx());

    expect(labels).toHaveLength(0);
    expect(markers).toHaveLength(0);
  });

  it('label axis remains per-category — flipping one category does not affect another', () => {
    const sub = createPoiSubsystem();
    const laniakea: PointOfInterest = {
      id: 'laniakea',
      name: 'Laniakea',
      category: 'supercluster',
      worldPos: [-50, -20, 10],
      featured: true,
      physicalRadiusMpc: 25,
    };
    sub.setPois([VIRGO_WITH_RING, laniakea]);

    // Hide ONLY supercluster labels.  Cluster labels + both markers
    // remain (cluster marker is still on, so the anchor gate doesn't
    // fire on the cluster label).
    sub.setCategoryLabelVisible('supercluster', false);

    const labels = sub.produceLabels(makeState(), makeCtx()).labels;
    const markers = sub.produceMarkers(makeState(), makeCtx());

    expect(labels.map((l) => l.text)).toEqual(['Virgo']);
    expect(markers.map((m) => m.category).sort()).toEqual(['cluster', 'supercluster']);
  });

  it('toggling marker visibility on/off preserves the label record', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO_WITH_RING]);
    // Start by hiding the label.  Marker should still emit (default).
    sub.setCategoryLabelVisible('cluster', false);
    // Now flip marker visibility off then back on.  Each flip must
    // leave the label record's `cluster: false` untouched — i.e. the
    // label remains hidden across the marker-axis churn.
    sub.setCategoryMarkerVisible('cluster', false);
    sub.setCategoryMarkerVisible('cluster', true);

    const labels = sub.produceLabels(makeState(), makeCtx()).labels;
    const markers = sub.produceMarkers(makeState(), makeCtx());

    expect(labels).toHaveLength(0);
    expect(markers).toHaveLength(1);
  });
});

describe('POI_STYLES labelColor alpha', () => {
  it('every labelColor has alpha=1 so the straight->premultiplied migration is a no-op', () => {
    // Migration safety: the label pack loop now multiplies rgb * a on
    // write (straight RGBA -> premultiplied at the GPU boundary).  If a
    // future POI_STYLES edit lowers a labelColor's alpha below 1, the
    // new pack-loop premultiplication will silently dim its RGB
    // channels relative to the pre-migration behaviour.  This test
    // fails loudly so the implementer can either re-balance the RGB
    // intent or confirm the dimming was deliberate.
    for (const [category, style] of Object.entries(POI_STYLES)) {
      expect(style.labelColor[3], `${category}.labelColor alpha`).toBe(1);
    }
  });
});
