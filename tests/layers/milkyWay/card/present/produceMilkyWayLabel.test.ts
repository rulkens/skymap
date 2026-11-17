import { ZERO_FOCUS } from '../../../../../src/services/engine/subsystems/recedingFocusSubsystem';
import { describe, expect, it } from 'vitest';
import { produceMilkyWayLabel as produceMilkyWayLabelFor } from '../../../../../src/layers/milkyWay/card/present/produceMilkyWayLabel';
import { MILKY_WAY_LABEL_STYLE } from '../../../../../src/layers/milkyWay/card/present/milkyWayLabelStyle';
import { MILKY_WAY_CENTER_WORLD } from '../../../../../src/data/milkyWay/galacticCenter';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Not a catalog value: the label must pack the code its Layer passes.
const PICK_CODE = 37;

// Minimal state: the producer reads settings.labels.focusedOnly (+ selection.focus
// for the solo gate); its fade arrives as the handed value.
function makeState(
  opts: { focusedOnly?: boolean; focus?: { type: string } | null } = {},
): EngineState {
  return {
    settings: {
      labels: { focusedOnly: opts.focusedOnly ?? false },
    },
    selection: { focus: opts.focus ?? null, select: null, hover: null },
  } as unknown as EngineState;
}

function makeCtx(camDistMpc: number): FrameView {
  return {
    snapshot: { nowMs: 0, focusBlend: 0, focus: ZERO_FOCUS },
    drawCamPos: [camDistMpc, 0, 0],
  } as unknown as FrameView;
}

describe('produceMilkyWayLabel', () => {
  it('outside the focused sphere the label draws but carries no pick; inside and at rest it keeps it', () => {
    const ctx = makeCtx(0.5);
    const at = (center: Vec3) =>
      ({
        ...ctx,
        snapshot: {
          ...ctx.snapshot,
          focus: { center, apparentRadiusMpc: 0.1, physicalRadiusMpc: 0.05, blend: 1 },
        },
      }) as FrameView;
    const pickOf = (c: FrameView) =>
      produceMilkyWayLabelFor(PICK_CODE)(makeState(), c, 1).labels[0]!.pickId;

    expect(pickOf(ctx)).toBeDefined();
    expect(pickOf(at([0, 0, 0]))).toBeDefined();
    expect(pickOf(at([5, 0, 0]))).toBeUndefined();
  });

  it('gates its pick at the galactic centre, as the disc does, not at the Sun', () => {
    const ctx = makeCtx(0.5);
    const kpcSphere = (center: Vec3) =>
      ({
        ...ctx,
        snapshot: {
          ...ctx.snapshot,
          focus: { center, apparentRadiusMpc: 0.001, physicalRadiusMpc: 0.0005, blend: 1 },
        },
      }) as FrameView;
    const pickOf = (c: FrameView) =>
      produceMilkyWayLabelFor(PICK_CODE)(makeState(), c, 1).labels[0]!.pickId;

    expect(pickOf(kpcSphere([0, 0, 0]))).toBeUndefined();
    expect(pickOf(kpcSphere([...MILKY_WAY_CENTER_WORLD] as Vec3))).toBeDefined();
  });

  it('emits one label carrying a leader when enabled', () => {
    const out = produceMilkyWayLabelFor(PICK_CODE)(makeState(), makeCtx(0.5), 1);
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0]!.id).toBe('milkyWay'); // id = source id; text stays below
    expect(out.labels[0]!.text).toBe('You are here');
    // Anchored at the origin dot; the label shader lifts the text by the 30 kpc
    // disc's apparent size and draws the stem up from the dot's centre.
    expect(out.labels[0]!.worldPos).toEqual([0, 0, 0]);
    expect(out.labels[0]!.lift!.radiusMpc).toBeCloseTo(0.015, 9);
    expect(out.labels[0]!.lift!.leader).toEqual({
      widthPx: MILKY_WAY_LABEL_STYLE.pixelWidth,
      color: [...MILKY_WAY_LABEL_STYLE.lineColor],
      base: 'centre',
      gapPx: 0,
    });
    expect(out.labels[0]!.fadeAlpha).toBe(1);
  });

  it('uses the handed value as fadeAlpha', () => {
    const out = produceMilkyWayLabelFor(PICK_CODE)(makeState(), makeCtx(0.5), 0.5);
    expect(out.labels[0]!.fadeAlpha).toBe(0.5);
  });

  it('focusedOnly mode: emits nothing when something else (or nothing) is focused', () => {
    const elsewhere = { type: 'structure', id: 'cluster-virgo' };
    expect(
      produceMilkyWayLabelFor(PICK_CODE)(
        makeState({ focusedOnly: true, focus: elsewhere }),
        makeCtx(0.5),
        1,
      ).labels,
    ).toEqual([]);
    expect(
      produceMilkyWayLabelFor(PICK_CODE)(
        makeState({ focusedOnly: true, focus: null }),
        makeCtx(0.5),
        1,
      ).labels,
    ).toEqual([]);
  });

  it('focusedOnly mode: emits the label when the Milky Way is the focused subject', () => {
    const out = produceMilkyWayLabelFor(PICK_CODE)(
      makeState({ focusedOnly: true, focus: { type: 'milkyWay' } }),
      makeCtx(0.5),
      1,
    );
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0]!.id).toBe('milkyWay');
  });
});
