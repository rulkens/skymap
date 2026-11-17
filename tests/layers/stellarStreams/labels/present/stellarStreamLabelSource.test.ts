import { describe, expect, it } from 'vitest';

import { stellarStreamLabelSource } from '../../../../../src/layers/stellarStreams/labels/present/stellarStreamLabelSource';
import { stellarStreamsSelectionRow } from '../../../../../src/layers/stellarStreams/selection/stellarStreamsSelectionRow';
import type { StellarStreamMeta } from '../../../../../src/layers/stellarStreams/catalog/@types/StellarStreamMeta';
import type { StellarStreamsRuntime } from '../../../../../src/layers/stellarStreams/@types/StellarStreamsRuntime';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import { packPickWord } from '../../../../../src/utils/labels/packPickWord';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { GD_1, SAGITTARIUS, STREAM_META } from '../../fixtures/streamMeta';

const runtimeOf = (meta: readonly StellarStreamMeta[] | null) =>
  ({ meta: () => meta, pickCode: 41 }) as unknown as StellarStreamsRuntime;
const STATE = {} as EngineState;

describe('stellarStreamLabelSource', () => {
  it('stellar streams describe their labels', () => {
    const runtime = runtimeOf(STREAM_META);
    const source = stellarStreamLabelSource(runtime);
    expect(stellarStreamLabelSource(runtimeOf(null)).items(STATE)).toEqual([]);

    const items = source.items(STATE);
    const gd1 = source.describe(items[1]!, 1)!;
    expect(items[1]).toBe(GD_1);
    expect(gd1.text).toBe('GD-1');
    expect(gd1.position).toEqual(GD_1.anchorMpc);
    expect(gd1.subjectRadiusMpc).toBeCloseTo((GD_1.lengthKpc * SCALE_UNITS.KPC_TO_MPC) / 2);
    // A click on the label selects what a click on the stream's ribbon does.
    const row = stellarStreamsSelectionRow(runtime);
    expect(packPickWord(gd1.pick!.code, gd1.pick!.index)).toBe(
      row.encodePick({ type: 'stellarStream', slug: GD_1.id }),
    );
    // Tinted by colourT: the warmer Sagittarius reads redder than GD-1.
    const sgr = source.describe(SAGITTARIUS, 0)!.color!;
    expect(sgr[0] - sgr[2]).toBeGreaterThan(gd1.color![0] - gd1.color![2]);
  });
});
