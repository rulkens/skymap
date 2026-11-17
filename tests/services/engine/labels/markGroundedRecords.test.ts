import { describe, expect, it } from 'vitest';
import type { OccluderBody } from '../../../../src/@types/scene/OccluderBody';
import { createLabelFrame } from '../../../../src/services/engine/labels/createLabelFrame';
import { resolveAnchors } from '../../../../src/services/engine/labels/resolveAnchors';
import { projectRecords } from '../../../../src/services/engine/labels/projectRecords';
import { markGroundedRecords } from '../../../../src/services/engine/labels/markGroundedRecords';
import { LABEL_RECORD, LABEL_RECORD_FLAGS } from '../../../../src/data/labels/labelRecordLayout';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { stageInputs, stageRecords } from '../../../helpers/labels/labelStageFixture';

describe('markGroundedRecords', () => {
  it("a sub-pixel subject on a body's ground never reads depth, and reads it again once off it", () => {
    // A 1 m rover 1 Mpc out, between the body's inner (deepest basin) and outer (highest peak) radii.
    const ground: OccluderBody = {
      positionMpc: [0, -1e-12, -1],
      radiusM: 0.9e-12 / SCALE_UNITS.M_TO_MPC,
      outerRadiusM: 1.1e-12 / SCALE_UNITS.M_TO_MPC,
    };
    const records = stageRecords([
      { text: 'A', position: [0, 0, -1], subjectRadiusMpc: SCALE_UNITS.M_TO_MPC },
    ]);
    const styleIndex = records.u32[LABEL_RECORD.style]!;
    const frame = createLabelFrame(records.capacity);
    const run = (occluders: readonly OccluderBody[]) => {
      for (const stage of [resolveAnchors, projectRecords, markGroundedRecords]) {
        stage(records, frame, stageInputs({ occluders }));
      }
      return records.u32[LABEL_RECORD.style]!;
    };
    expect(run([ground])).toBe(styleIndex | LABEL_RECORD_FLAGS.grounded);
    expect(run([{ ...ground, positionMpc: [0, -2e-12, -1] }])).toBe(styleIndex);
  });
});
