/** "You are here" picks what a click on the disc impostor does, so a click selects the Milky Way. */

import { describe, expect, it } from 'vitest';

import { milkyWayLabelSource } from '../../../../../src/layers/milkyWay/card/present/milkyWayLabelSource';
import { milkyWaySelectionRow } from '../../../../../src/layers/milkyWay/selection/milkyWaySelectionRow';
import { packPickWord } from '../../../../../src/utils/labels/packPickWord';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import { milkyWayPickCode } from '../../../../support/layerPickCodes';

describe('milkyWayLabelSource', () => {
  it('the Milky Way describes its labels', () => {
    const code = milkyWayPickCode();
    const source = milkyWayLabelSource(code);
    const labels = source.items({} as EngineState).map((item, i) => source.describe(item, i)!);
    expect(labels).toHaveLength(1);
    expect(labels[0]!.position).toEqual([0, 0, 0]);
    expect(packPickWord(labels[0]!.pick!.code, labels[0]!.pick!.index)).toBe(
      milkyWaySelectionRow(code).encodePick({ type: 'milkyWay' }),
    );
  });
});
