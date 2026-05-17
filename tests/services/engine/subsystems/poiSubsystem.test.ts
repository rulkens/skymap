import { describe, expect, it } from 'vitest';
import { createPoiSubsystem } from '../../../../src/services/engine/subsystems/poiSubsystem';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeState(): EngineState {
  return { subsystems: { scheduler: { requestRender: () => {} } } } as unknown as EngineState;
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
  crosshairSizeMpc: 5,
};
const M31: PointOfInterest = {
  id: 'm31',
  name: 'Andromeda Galaxy',
  category: 'famousGalaxy',
  worldPos: [0.5, 0.1, 0.0],
};
const BOOTES_VOID: PointOfInterest = {
  id: 'bootes',
  name: 'Boötes Void',
  category: 'void',
  worldPos: [200, 100, 50],
  crosshairSizeMpc: 20,
};
const LANIAKEA: PointOfInterest = {
  id: 'laniakea',
  name: 'Laniakea',
  category: 'supercluster',
  worldPos: [-50, -20, 10],
  crosshairSizeMpc: 25,
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

  it('emits 3 perpendicular crosshair lines for POIs with crosshairSizeMpc', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.lines).toHaveLength(3);
  });

  it('omits crosshair lines for POIs without crosshairSizeMpc', () => {
    const sub = createPoiSubsystem();
    sub.setPois([M31]);
    const out = sub.produceLabels(makeState(), makeCtx());
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
});
