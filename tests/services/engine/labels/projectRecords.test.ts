import { describe, expect, it } from 'vitest';
import type { LabelDescription } from '../../../../src/@types/rendering/LabelDescription';
import { createLabelFrame } from '../../../../src/services/engine/labels/createLabelFrame';
import { resolveAnchors } from '../../../../src/services/engine/labels/resolveAnchors';
import { projectRecords } from '../../../../src/services/engine/labels/projectRecords';
import type { ProjectedLabel } from '../../../../src/@types/rendering/ProjectedLabel';
import { ATLAS_FONT_SIZE } from '../../../../src/data/fonts';
import { projectLabel } from '../../../../src/utils/labels/projectLabel';
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

  it('mono ink boxes are unchanged', () => {
    const label: LabelDescription = { text: 'AAA', position: [0.3, -0.2, -1] };
    const records = stageRecords([label], 'constellation');
    const frame = createLabelFrame(records.capacity);
    for (const stage of [resolveAnchors, projectRecords]) stage(records, frame, stageInputs());
    const anchor: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };
    projectLabel([0.3, -0.2, 1], STAGE_CAMERA.output, anchor);
    const scale = frame.textPx[0]! / ATLAS_FONT_SIZE;
    const box = records.textBox;
    expect(box[2]! - box[0]!).toBeGreaterThan(0);
    expect([...frame.rect.subarray(0, 4)]).toEqual(
      [0, 1, 2, 3].map((k) => Math.fround(anchor.px[k % 2]! + box[k]! * scale)),
    );
  });

  it('the ink box bounds all four card corners', () => {
    // On the right horizon up points left, so the line of text runs down the image,
    // stretched by the fisheye: longer than the same text at the zenith.
    const rectOf = (position: [number, number, number]) => {
      const records = stageRecords([{ text: 'AAA', position }], 'constellation');
      const frame = createLabelFrame(records.capacity);
      const inputs = stageInputs({ projection: equidistantFixture(2000) });
      for (const stage of [resolveAnchors, projectRecords]) stage(records, frame, inputs);
      const [x0, y0, x1, y1] = frame.rect;
      return { width: x1! - x0!, height: y1! - y0! };
    };
    const zenith = rectOf([0, 1, 0]);
    const horizon = rectOf([1, 0, 0]);
    expect(horizon.height / zenith.width).toBeCloseTo(Math.PI / 2, 1);
    expect(horizon.width).toBeGreaterThan(0.9 * zenith.height);
    expect(horizon.width).toBeLessThan(1.1 * zenith.height);
  });
});
