/**
 * poiSubsystem · labelStyleOverride integration
 *
 * Exercises the override path through the real producer: when the
 * DebugPanel's LabelEffectsSection picks a POI category as the target,
 * any POI whose own category matches adopts the override's outline
 * fields; non-matching POIs keep their category-default outline.
 *
 * State stub: the producer only touches state.subsystems.fades.fadeTo
 * (one-shot layer fade-in).  Context stub mirrors poiSubsystem.test.ts
 * — a 60° fovY at 1920×1080.  The cluster POI sits at +X with
 * physicalRadiusMpc set so the marker pass keeps the anchor gate happy
 * (label visibility for clusters is gated on the marker being visible).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createPoiSubsystem } from '../../../../src/services/engine/subsystems/poiSubsystem';
import {
  clearLabelStyleOverride,
  setLabelStyleOverride,
} from '../../../../src/services/engine/labelStyleOverride';
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
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

describe('poiSubsystem · labelStyleOverride', () => {
  beforeEach(() => {
    clearLabelStyleOverride();
  });

  it('applies the override only to labels whose category matches', () => {
    setLabelStyleOverride({
      targetCategory: 'cluster',
      outlineColor: [1, 1, 0, 1],
      outlineEmFrac: 0.06,
    });
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(1);
    const label = out.labels[0]!;
    expect(label.outlineColor).toEqual([1, 1, 0, 1]);
    expect(label.outlineEmFrac).toBe(0.06);
  });

  it('falls back to the category baked-in outline when override targets another category', () => {
    setLabelStyleOverride({
      targetCategory: 'void',
      outlineColor: [1, 1, 0, 1],
      outlineEmFrac: 0.06,
    });
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(1);
    const label = out.labels[0]!;
    expect(label.outlineColor).toEqual([0, 0, 0, 0.1]);
    expect(label.outlineEmFrac).toBe(0.16);
  });
});
