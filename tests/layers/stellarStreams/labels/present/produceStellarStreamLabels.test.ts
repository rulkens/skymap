import { describe, expect, it } from 'vitest';

import { produceStellarStreamLabels } from '../../../../../src/layers/stellarStreams/labels/present/produceStellarStreamLabels';
import { stellarStreamsSelectionRow } from '../../../../../src/layers/stellarStreams/selection/stellarStreamsSelectionRow';
import type { StellarStreamMeta } from '../../../../../src/layers/stellarStreams/catalog/@types/StellarStreamMeta';
import type { StellarStreamsRuntime } from '../../../../../src/layers/stellarStreams/@types/StellarStreamsRuntime';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import { GD_1, SAGITTARIUS, SHORT, STREAM_META } from '../../fixtures/streamMeta';
import { RECEDE_ALL_FOCUS_SPHERE } from '../../../../../src/data/selection/recedeAllFocusSphere';

const ZERO_FOCUS = { center: [0, 0, 0], apparentRadiusMpc: 0, physicalRadiusMpc: 0, blend: 0 };
const CTX = {
  drawCamPos: [0, 0, 0],
  drawPxPerRad: 1000,
  snapshot: { focus: ZERO_FOCUS },
} as unknown as FrameView;

function runtimeOf(meta: readonly StellarStreamMeta[] | null) {
  return { meta: () => meta, pickCode: 41 } as unknown as StellarStreamsRuntime;
}
const NO_SELECTION = { hover: null, select: null };
const produce = (meta: readonly StellarStreamMeta[] | null, selection = NO_SELECTION) =>
  produceStellarStreamLabels(runtimeOf(meta))({ selection } as unknown as EngineState, CTX, 1)
    .labels;

describe('produceStellarStreamLabels', () => {
  it('emits one label per stream once the meta is in', () => {
    expect(produce(STREAM_META).map((l) => l.id)).toEqual(STREAM_META.map((m) => `stream:${m.id}`));
  });

  it('none before', () => {
    expect(produce(null)).toEqual([]);
  });

  it("each label's pickId equals the selection row's encodePick", () => {
    const row = stellarStreamsSelectionRow(runtimeOf(STREAM_META));
    for (const [i, label] of produce(STREAM_META).entries()) {
      expect(label.pickId).toBe(
        row.encodePick({ type: 'stellarStream', slug: STREAM_META[i]!.id }),
      );
    }
  });

  it('a stream focus leaves only its own caption pickable', () => {
    const row = stellarStreamsSelectionRow(runtimeOf(STREAM_META));
    const focusPickId = row.encodePick({ type: 'stellarStream', slug: GD_1.id });
    const ctx = {
      ...CTX,
      snapshot: { focus: { ...RECEDE_ALL_FOCUS_SPHERE, blend: 1 }, focusPickId },
    } as unknown as FrameView;
    const labels = produceStellarStreamLabels(runtimeOf(STREAM_META))(
      { selection: NO_SELECTION } as unknown as EngineState,
      ctx,
      1,
    ).labels;
    expect(labels.filter((l) => l.pickId !== undefined).map((l) => l.id)).toEqual(['stream:gd-1']);
  });

  it('a longer stream outranks a shorter one at equal distance', () => {
    const [long, short] = produce([GD_1, { ...SHORT, anchorMpc: GD_1.anchorMpc }]);
    expect(long!.declutterPriority!).toBeGreaterThan(short!.declutterPriority!);
  });

  it('a high-colourT stream gets a warmer caption than a low one', () => {
    const [sgr, gd1] = produce([SAGITTARIUS, GD_1]);
    expect(sgr!.color![0] - sgr!.color![2]).toBeGreaterThan(gd1!.color![0] - gd1!.color![2]);
    expect(Math.max(...sgr!.color!.slice(0, 3))).toBe(1);
    expect(sgr!.color![3]).toBe(0.85);
  });

  describe('the apparent-length gate', () => {
    // 4 kpc at 100 kpc is 40 px at 1000 px/rad: under the 150 px floor.
    const far = { ...SHORT, anchorMpc: [0.1, 0, 0] as const };
    const ref = { type: 'stellarStream', slug: far.id };
    const ids = (selection = NO_SELECTION) =>
      produce([SAGITTARIUS, far], selection).map((l) => l.id);

    it('a short far stream gets no caption; a long one does', () => {
      expect(ids()).toEqual(['stream:sagittarius']);
    });

    it('the short stream gets one while hovered or selected', () => {
      expect(ids({ hover: ref, select: null } as never)).toContain('stream:pal5');
      expect(ids({ hover: null, select: ref } as never)).toContain('stream:pal5');
    });
  });
});
