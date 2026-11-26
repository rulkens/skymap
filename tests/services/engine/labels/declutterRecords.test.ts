import { packPickWord } from '../../../../src/data/selectionEncoding';
import { describe, expect, it } from 'vitest';
import type { LabelDescription } from '../../../../src/@types/rendering/LabelDescription';
import { createLabelFrame } from '../../../../src/services/engine/labels/createLabelFrame';
import { resolveAnchors } from '../../../../src/services/engine/labels/resolveAnchors';
import { projectRecords } from '../../../../src/services/engine/labels/projectRecords';
import { targetAlpha } from '../../../../src/services/engine/labels/targetAlpha';
import { declutterRecords } from '../../../../src/services/engine/labels/declutterRecords';
import { stageInputs, stageRecords } from '../../../helpers/labels/labelStageFixture';

describe('declutterRecords', () => {
  it('ranking is priority band first, apparent diameter within a band', () => {
    // Three labels on one spot, 1 Mpc out: 16, 312 and 78 px across.
    const label = (priority: number, subjectRadiusMpc: number): LabelDescription => ({
      text: 'AAA',
      position: [0, 0, -1],
      subjectRadiusMpc,
      priority,
    });
    const records = stageRecords([label(1, 0.01), label(0, 0.2), label(1, 0.05)], 'constellation');
    const frame = createLabelFrame(records.capacity);
    const inputs = stageInputs();
    for (const stage of [resolveAnchors, projectRecords, targetAlpha, declutterRecords]) {
      stage(records, frame, inputs);
    }
    expect(Array.from(frame.survivor.subarray(0, 3))).toEqual([0, 0, 1]);
  });

  it('a hovered or selected label wins over a higher band', () => {
    const label = (priority: number, index: number): LabelDescription => ({
      text: 'AAA',
      position: [0, 0, -1],
      priority,
      pick: { code: 1, index },
    });
    const records = stageRecords([label(1, 0), label(0, 1)], 'constellation');
    const frame = createLabelFrame(records.capacity);
    const inputs = stageInputs({ hoveredPick: packPickWord(1, 1) });
    for (const stage of [resolveAnchors, projectRecords, targetAlpha, declutterRecords]) {
      stage(records, frame, inputs);
    }
    expect(Array.from(frame.survivor.subarray(0, 2))).toEqual([0, 1]);
  });
});
