import { describe, expect, it } from 'vitest';
import type { LabelDescription } from '../../../../src/@types/rendering/LabelDescription';
import { createLabelFrame } from '../../../../src/services/engine/labels/createLabelFrame';
import { resolveAnchors } from '../../../../src/services/engine/labels/resolveAnchors';
import { projectRecords } from '../../../../src/services/engine/labels/projectRecords';
import { LABEL_STYLES } from '../../../../src/data/labels/labelStyles';
import { LABEL_EM_PX_RETUNE } from '../../../../src/data/labels/labelSizingDefaults';
import { LABEL_TEXT_PX } from '../../../../src/data/labels/labelTextPx';
import { equidistantFixture } from '../../../helpers/labels/equidistantFixture';
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

  it('pinhole text height is unchanged off axis', () => {
    // 20° right of the axis, at a depth where a cluster's em sits inside the clamp.
    const depth = 25;
    const label: LabelDescription = {
      text: 'AAA',
      position: [depth * Math.tan((20 * Math.PI) / 180), 0, -depth],
    };
    const records = stageRecords([label], 'galaxyCluster');
    const frame = createLabelFrame(records.capacity);
    for (const stage of [resolveAnchors, projectRecords]) stage(records, frame, stageInputs());
    const em = LABEL_STYLES.galaxyCluster.textHeight.mpc;
    const viewDepthRule = (em / depth) * STAGE_CAMERA.output.focalPx * LABEL_EM_PX_RETUNE;
    expect(viewDepthRule).toBeGreaterThan(LABEL_TEXT_PX.min);
    expect(viewDepthRule).toBeLessThan(LABEL_TEXT_PX.max);
    // The column is f32.
    expect(frame.textPx[0]).toBeCloseTo(Math.fround(viewDepthRule), 9);
  });

  it('equidistant text height depends on distance alone', () => {
    const off = (80 * Math.PI) / 180;
    const labels: LabelDescription[] = [
      { text: 'AAA', position: [0, 20, 0] },
      { text: 'AAA', position: [0, 20 * Math.cos(off), 20 * Math.sin(off)] },
    ];
    const records = stageRecords(labels, 'galaxyCluster');
    const frame = createLabelFrame(records.capacity);
    const inputs = stageInputs({ projection: equidistantFixture(2000) });
    for (const stage of [resolveAnchors, projectRecords]) stage(records, frame, inputs);
    expect(frame.visible[1]).toBe(1);
    expect(frame.textPx[0]).toBeGreaterThan(LABEL_TEXT_PX.min);
    expect(frame.textPx[0]).toBeLessThan(LABEL_TEXT_PX.max);
    expect(frame.textPx[1]).toBeCloseTo(frame.textPx[0]!, 5);
  });
});
