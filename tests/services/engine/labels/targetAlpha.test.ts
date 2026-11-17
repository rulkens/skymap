import { describe, expect, it } from 'vitest';
import type { LabelDescription } from '../../../../src/@types/rendering/LabelDescription';
import type { LabelFrameInputs } from '../../../../src/@types/rendering/LabelFrameInputs';
import type { LabelStyleId } from '../../../../src/@types/rendering/LabelStyleId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import { createLabelFrame } from '../../../../src/services/engine/labels/createLabelFrame';
import { resolveAnchors } from '../../../../src/services/engine/labels/resolveAnchors';
import { projectRecords } from '../../../../src/services/engine/labels/projectRecords';
import { targetAlpha } from '../../../../src/services/engine/labels/targetAlpha';
import { packPickWord } from '../../../../src/utils/labels/packPickWord';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { stageInputs, stageRecords } from '../../../helpers/labels/labelStageFixture';

function targets(
  descriptions: readonly LabelDescription[],
  over: Partial<LabelFrameInputs> = {},
  style?: LabelStyleId,
) {
  const records = stageRecords(descriptions, style);
  const frame = createLabelFrame(records.capacity);
  const inputs = stageInputs(over);
  for (const stage of [resolveAnchors, projectRecords, targetAlpha]) stage(records, frame, inputs);
  return frame;
}

const at = (x: number, radius = 0.1, pickIndex?: number): LabelDescription => ({
  text: 'A',
  position: [x, 0, -1],
  subjectRadiusMpc: radius,
  ...(pickIndex === undefined ? {} : { pick: { code: 1, index: pickIndex } }),
});

describe('targetAlpha', () => {
  it('a label fades out as its subject fills the view', () => {
    // 1 Mpc away on a 779 px focal: 0.1 Mpc is 156 px across, 0.55 Mpc 857 px of a 900 px short side.
    const frame = targets([at(0, 0.1), at(0, 0.55)]);
    expect(frame.target[0]).toBe(1);
    expect(frame.target[1]).toBe(0);
  });

  it('a near-scene label behind a body is hidden', () => {
    const body = (x: number) => ({
      positionMpc: [x, 0, -0.5] as [number, number, number],
      radiusM: 0.05 / SCALE_UNITS.M_TO_MPC,
      outerRadiusM: 0.05 / SCALE_UNITS.M_TO_MPC,
    });
    expect(targets([at(0)], { occluders: [body(0)] }).target[0]).toBe(0);
    expect(targets([at(0)], { occluders: [body(0.3)] }).target[0]).toBe(1);
  });

  it("focused-only hides every label but the focused subject's", () => {
    const frame = targets([at(0, 0.1, 0), at(0.2, 0.1, 1), at(-0.2)], {
      focusedOnly: true,
      focusPickId: packPickWord(1, 0),
    });
    expect(Array.from(frame.target.subarray(0, 3))).toEqual([1, 0, 0]);
  });

  it('a hovered or selected subject keeps its label below the appear threshold', () => {
    // 1.6 px across, under galaxyCluster's 10 px appear threshold.
    const labels = [at(0, 0.001, 0), at(0.2, 0.001, 1), at(-0.2, 0.001, 2)];
    const frame = targets(labels, {
      hoveredPick: packPickWord(1, 0),
      selectedPick: packPickWord(1, 1),
    });
    expect(Array.from(frame.target.subarray(0, 3))).toEqual([1, 1, 0]);
  });

  it("the focused subject's label stays clickable; a dimmed subject's does not", () => {
    // Both subjects lie far outside the focus sphere, so the focus dims them.
    const frame = targets([at(0, 0.1, 0), at(0.2, 0.1, 1)], {
      focusPickId: packPickWord(1, 0),
      focus: { center: [100, 0, 0], apparentRadiusMpc: 1, physicalRadiusMpc: 1, blend: 1 },
    });
    expect(Array.from(frame.clickable.subarray(0, 2))).toEqual([1, 0]);
  });

  it('a label with no position this frame has zero alpha', () => {
    const earth: BodyState = { positionMpc: [0, 0, -1] } as BodyState;
    const anchored = (anchorId: string): LabelDescription => ({
      text: 'A',
      position: { anchorId },
    });
    const frame = targets(
      [anchored('earth'), anchored('voyager-before-launch')],
      { bodyStates: new Map([['earth', earth]]) },
      'constellation',
    );
    expect(frame.target[0]).toBe(1);
    expect(frame.target[1]).toBe(0);
  });
});
