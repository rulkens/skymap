import { packPickWord } from '../../../../src/data/selectionEncoding';
import { describe, expect, it } from 'vitest';
import type { LabelDescription } from '../../../../src/@types/rendering/LabelDescription';
import type { LabelFrameInputs } from '../../../../src/@types/rendering/LabelFrameInputs';
import type { LabelStyleId } from '../../../../src/@types/rendering/LabelStyleId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import { createLabelFrame } from '../../../../src/services/engine/labels/createLabelFrame';
import { resolveAnchors } from '../../../../src/services/engine/labels/resolveAnchors';
import { projectRecords } from '../../../../src/services/engine/labels/projectRecords';
import { targetAlpha } from '../../../../src/services/engine/labels/targetAlpha';
import { LABEL_DIRECTORS } from '../../../../src/data/labels/labelDirectors';
import { COSMO } from '../../../../src/services/engine/frame/slabs';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { equidistantFixture } from '../../../helpers/labels/equidistantFixture';
import { STAGE_CAMERA, stageInputs, stageRecords } from '../../../helpers/labels/labelStageFixture';
import { LABEL_STYLES } from '../../../../src/data/labels/labelStyles';

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

  it('a subject filling the dome fades its caption', () => {
    // 637 px per radian: 1 rad across is 637 px, a third of the 2000 px (180°) short side
    // but 87% of the default lens's 735 px; half a radian is not.
    const dome = { projection: equidistantFixture(2000) };
    const frame = targets(
      [
        { text: 'A', position: [0, 1, 0.2], subjectRadiusMpc: 0.5 * Math.hypot(1, 0.2) },
        { text: 'A', position: [0.2, 1, 0], subjectRadiusMpc: 0.25 * Math.hypot(1, 0.2) },
      ],
      dome,
    );
    expect(Array.from(frame.target.subarray(0, 2))).toEqual([0, 1]);
  });

  it('a wide lens judges the fill against the default lens, a narrow one against its short side', () => {
    // 0.35 Mpc at 1 Mpc is 0.7 rad across: 61% of the 60° lens's short side.
    const lens = (fovRad: number) => {
      const focalPx = 450 / Math.tan(fovRad / 2);
      return { projection: { ...STAGE_CAMERA.output, focalPx } };
    };
    expect(targets([at(0, 0.35)]).target[0]).toBe(1);
    expect(targets([at(0, 0.35)], lens(Math.PI / 6)).target[0]).toBe(0);
    // At 120° it spans 20% of the short side, and fades as it does at 60°.
    expect(targets([at(0, 0.35)], lens((2 * Math.PI) / 3)).target[0]).toBe(1);
    expect(targets([at(0, 0.55)], lens((2 * Math.PI) / 3)).target[0]).toBe(0);
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

  it('a far-scene label behind a body is hidden too', () => {
    const body = {
      positionMpc: [0, 0, -0.5] as [number, number, number],
      radiusM: 0.05 / SCALE_UNITS.M_TO_MPC,
      outerRadiusM: 0.05 / SCALE_UNITS.M_TO_MPC,
    };
    const director = LABEL_DIRECTORS.find((row) => row.slab === COSMO)!;
    expect(targets([at(0)], { occluders: [body], director }).target[0]).toBe(0);
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

  it('a hovered or selected subject keeps its label under another focus', () => {
    // Subject 2 is focused; 0 is hovered and 1 selected, under focused-only and a full recession.
    const labels = [at(0, 0.1, 0), at(0.2, 0.1, 1), at(-0.2, 0.1, 2), at(0.4, 0.1, 3)];
    const named = {
      hoveredPick: packPickWord(1, 0),
      selectedPick: packPickWord(1, 1),
      focusPickId: packPickWord(1, 2),
    };
    const onlyFocused = targets(labels, { ...named, focusedOnly: true });
    expect(Array.from(onlyFocused.target.subarray(0, 4))).toEqual([1, 1, 1, 0]);
    const receded = targets(labels, { ...named, recessions: [0] });
    expect(Array.from(receded.target.subarray(0, 4))).toEqual([1, 1, 1, 0]);
  });

  it('a hovered subject behind a body is still hidden', () => {
    const body = {
      positionMpc: [0, 0, -0.5] as [number, number, number],
      radiusM: 0.05 / SCALE_UNITS.M_TO_MPC,
      outerRadiusM: 0.05 / SCALE_UNITS.M_TO_MPC,
    };
    const frame = targets([at(0, 0.1, 0)], { occluders: [body], hoveredPick: packPickWord(1, 0) });
    expect(frame.target[0]).toBe(0);
  });

  it('an above label whose subject is behind the eye is not visible', () => {
    // 1 Mpc behind the eye with a 0.9 Mpc radius: the 3-radii lift turns the anchor forward.
    const behind: LabelDescription = { text: 'A', position: [0, 0.2, 1], subjectRadiusMpc: 0.9 };
    expect(targets([behind], {}, 'famousGalaxy').visible[0]).toBe(0);
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

  it('a director with a near-hide distance hides labels nearer than it', () => {
    const director = { ...stageInputs().director, nearHideMpc: 0.01 };
    const near: LabelDescription = { text: 'A', position: [0, 0, -0.005] };
    // Off axis: 12.7 kpc away though only 9 kpc deep, so distance is what is judged.
    const far: LabelDescription = { text: 'A', position: [0.009, 0, -0.009] };
    const frame = targets([near, far], { director }, 'constellation');
    expect(Array.from(frame.target.subarray(0, 2))).toEqual([0, 1]);
  });

  it('the appear band is CSS px, so it doubles on a dense display; the fills-view fade does not', () => {
    const { fromPx, bandPx } = LABEL_STYLES.galaxyCluster.appear;
    const radius = (1.2 * (fromPx + bandPx)) / (2 * STAGE_CAMERA.output.focalPx);
    const dense = { projection: { ...STAGE_CAMERA.output, pxScale: 2 } };
    expect(targets([at(0, radius)]).target[0]).toBe(1);
    const half = targets([at(0, radius)], dense).target[0]!;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    expect(targets([at(0, 0.55)], dense).target[0]).toBe(0);
  });
});
