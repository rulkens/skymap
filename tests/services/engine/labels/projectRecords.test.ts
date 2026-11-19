import { describe, expect, it } from 'vitest';
import type { LabelDescription } from '../../../../src/@types/rendering/LabelDescription';
import { createLabelFrame } from '../../../../src/services/engine/labels/createLabelFrame';
import { resolveAnchors } from '../../../../src/services/engine/labels/resolveAnchors';
import { projectRecords } from '../../../../src/services/engine/labels/projectRecords';
import { LABEL_TEXT_PX } from '../../../../src/data/labels/labelTextPx';
import { STAGE_CAMERA, stageInputs, stageRecords } from '../../../helpers/labels/labelStageFixture';

describe('projectRecords', () => {
  it('text and its ink box are pxScale times larger in device px on a dense display', () => {
    // A constellation name has no em of its own, so it sits at the minimum text size.
    const label: LabelDescription = { text: 'AAA', position: [0, 0, -1] };
    const project = (pxScale: number) => {
      const records = stageRecords([label], 'constellation');
      const frame = createLabelFrame(records.capacity);
      const inputs = stageInputs({ projection: { ...STAGE_CAMERA.output, pxScale } });
      for (const stage of [resolveAnchors, projectRecords]) stage(records, frame, inputs);
      return { textPx: frame.textPx[0]!, width: frame.rect[2]! - frame.rect[0]! };
    };
    const css = project(1);
    const dense = project(2);
    expect(css.textPx).toBe(LABEL_TEXT_PX.min);
    expect(dense.textPx).toBe(2 * LABEL_TEXT_PX.min);
    expect(dense.width).toBeCloseTo(2 * css.width, 6);
  });
});
