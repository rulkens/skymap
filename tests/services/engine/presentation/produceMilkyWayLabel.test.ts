import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  produceMilkyWayLabel,
  __resetMilkyWayLabelLoadIn,
} from '../../../../src/services/engine/presentation/produceMilkyWayLabel';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import {
  setLabelStyleOverride,
  clearLabelStyleOverride,
} from '../../../../src/services/engine/labelStyleOverride';

// Minimal state: the producer reads settings.milkyWay.labelEnabled, the fade
// registry (opacityOf + fadeTo), the selection focused() is not consulted (single
// label, no recession), and the label-style override (global module, no stub).
function makeState(labelEnabled: boolean, layerOpacity: number): EngineState {
  return {
    settings: { milkyWay: { enabled: true, labelEnabled } },
    subsystems: {
      fades: {
        opacityOf: () => layerOpacity,
        fadeTo: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      },
    },
  } as unknown as EngineState;
}

function makeCtx(camDistMpc: number): ReadyFrameContext {
  return { drawCamPos: [camDistMpc, 0, 0] } as unknown as ReadyFrameContext;
}

describe('produceMilkyWayLabel', () => {
  // Reset both module-global slots: the load-in latch and the live-tuning
  // override (set by the override tests below) — otherwise they leak forward.
  afterEach(() => {
    __resetMilkyWayLabelLoadIn();
    clearLabelStyleOverride();
  });

  it('emits one label and one line at full alpha when close (<= 0.6 Mpc) and enabled', () => {
    const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(0.5));
    expect(out.labels).toHaveLength(1);
    expect(out.lines).toHaveLength(1);
    expect(out.labels[0]!.id).toBe('milkyWay'); // id = source id; text stays below
    expect(out.labels[0]!.text).toBe('You are here');
    expect(out.lines[0]!.ownerLabelId).toBe('milkyWay');
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(1);
    expect(out.lines[0]!.fadeAlpha).toBeCloseTo(1);
  });

  it('emits nothing far away (>= 2 Mpc) even when enabled', () => {
    const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(2.0));
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('emits nothing when the label axis is disabled and faded out', () => {
    const out = produceMilkyWayLabel(makeState(false, 0), makeCtx(0.5));
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('multiplies the layer opacity into the distance fade', () => {
    const out = produceMilkyWayLabel(makeState(true, 0.5), makeCtx(0.5));
    // distAlpha = 1 at 0.5 Mpc, layerOpacity = 0.5 → 0.5
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(0.5);
  });

  it('keeps emitting the fade-out tail when disabled but still fading (opacity > 0)', () => {
    const out = produceMilkyWayLabel(makeState(false, 0.3), makeCtx(0.5));
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(0.3);
  });

  it('fires the load-in fadeTo(1) once on first intended-visible emit', () => {
    const state = makeState(true, 1);
    produceMilkyWayLabel(state, makeCtx(0.5));
    produceMilkyWayLabel(state, makeCtx(0.5));
    expect(state.subsystems.fades.fadeTo).toHaveBeenCalledTimes(1);
    expect(state.subsystems.fades.fadeTo).toHaveBeenCalledWith(
      { kind: 'labelLayer', layer: 'milkyWay' },
      1,
      expect.any(Number),
    );
  });

  it('does not fire the load-in while disabled and fading out', () => {
    const state = makeState(false, 0.3);
    produceMilkyWayLabel(state, makeCtx(0.5));
    expect(state.subsystems.fades.fadeTo).not.toHaveBeenCalled();
  });

  it('applies the label-style override outline when targetCategory is milkyWay', () => {
    setLabelStyleOverride({
      targetCategory: 'milkyWay',
      outlineColor: [0.2, 0.4, 0.6, 1],
      outlineEmFrac: 0.25,
    });
    const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(0.5));
    expect(out.labels[0]!.outlineColor).toEqual([0.2, 0.4, 0.6, 1]);
    expect(out.labels[0]!.outlineEmFrac).toBe(0.25);
  });

  it('falls back to the baked outline when the override targets another category', () => {
    // Override is active but aimed at 'cluster', so the milkyWay producer
    // ignores it and keeps the baked MILKY_WAY_LABEL_STYLE outline.
    setLabelStyleOverride({
      targetCategory: 'cluster',
      outlineColor: [1, 0, 0, 1],
      outlineEmFrac: 0.9,
    });
    const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(0.5));
    expect(out.labels[0]!.outlineColor).toEqual([0, 0, 0, 0.1]);
    expect(out.labels[0]!.outlineEmFrac).toBe(0.16);
  });

  it('reports awake: false across the fade band', () => {
    for (const r of [0.1, 0.5, 0.8, 1.1, 1.5]) {
      const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(r));
      expect(out.awake).toBe(false);
      __resetMilkyWayLabelLoadIn();
    }
  });
});
