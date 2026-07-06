import { describe, expect, it } from 'vitest';
import { produceMilkyWayLabel } from '../../../../src/services/engine/presentation/produceMilkyWayLabel';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

// Minimal state: the producer reads settings.milkyWay.labelEnabled,
// settings.labels.focusedOnly (+ selection.focus for the solo gate), and the
// fade registry (opacityOf only — the producer is a pure reader).
function makeState(
  labelEnabled: boolean,
  layerOpacity: number,
  opts: { focusedOnly?: boolean; focus?: { type: string } | null } = {},
): EngineState {
  return {
    settings: {
      milkyWay: { enabled: true, labelEnabled },
      labels: { focusedOnly: opts.focusedOnly ?? false },
    },
    selection: { focus: opts.focus ?? null, select: null, hover: null },
    subsystems: {
      fades: {
        opacityOf: () => layerOpacity,
      },
    },
  } as unknown as EngineState;
}

function makeCtx(camDistMpc: number): ReadyFrameContext {
  return { drawCamPos: [camDistMpc, 0, 0], nowMs: 0 } as unknown as ReadyFrameContext;
}

describe('produceMilkyWayLabel', () => {
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

  it('focusedOnly mode: emits nothing when something else (or nothing) is focused', () => {
    const elsewhere = { type: 'structure', id: 'cluster-virgo' };
    expect(
      produceMilkyWayLabel(
        makeState(true, 1, { focusedOnly: true, focus: elsewhere }),
        makeCtx(0.5),
      ).labels,
    ).toEqual([]);
    expect(
      produceMilkyWayLabel(makeState(true, 1, { focusedOnly: true, focus: null }), makeCtx(0.5))
        .labels,
    ).toEqual([]);
  });

  it('focusedOnly mode: emits the label when the Milky Way is the focused subject', () => {
    const out = produceMilkyWayLabel(
      makeState(true, 1, { focusedOnly: true, focus: { type: 'milkyWay' } }),
      makeCtx(0.5),
    );
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0]!.id).toBe('milkyWay');
  });

  it('reports awake: false across the fade band', () => {
    for (const r of [0.1, 0.5, 0.8, 1.1, 1.5]) {
      const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(r));
      expect(out.awake).toBe(false);
    }
  });
});
