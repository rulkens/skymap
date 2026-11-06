import { describe, expect, it } from 'vitest';

import { produceStellarStreamLabels } from '../../../../../src/layers/stellarStreams/labels/present/produceStellarStreamLabels';
import { stellarStreamsSelectionRow } from '../../../../../src/layers/stellarStreams/selection/stellarStreamsSelectionRow';
import type { StellarStreamMeta } from '../../../../../src/layers/stellarStreams/catalog/@types/StellarStreamMeta';
import type { StellarStreamsRuntime } from '../../../../../src/layers/stellarStreams/@types/StellarStreamsRuntime';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import { GD_1, SHORT, STREAM_META } from '../../fixtures/streamMeta';

const ZERO_FOCUS = { center: [0, 0, 0], apparentRadiusMpc: 0, physicalRadiusMpc: 0, blend: 0 };
const CTX = {
  drawCamPos: [0, 0, 0],
  drawPxPerRad: 1000,
  snapshot: { focus: ZERO_FOCUS },
} as unknown as FrameView;

function runtimeOf(meta: readonly StellarStreamMeta[] | null) {
  return { meta: () => meta, pickCode: 41 } as unknown as StellarStreamsRuntime;
}
const produce = (meta: readonly StellarStreamMeta[] | null) =>
  produceStellarStreamLabels(runtimeOf(meta))({} as EngineState, CTX, 1).labels;

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

  it('a longer stream outranks a shorter one at equal distance', () => {
    const [long, short] = produce([GD_1, { ...SHORT, anchorMpc: GD_1.anchorMpc }]);
    expect(long!.declutterPriority!).toBeGreaterThan(short!.declutterPriority!);
  });
});
