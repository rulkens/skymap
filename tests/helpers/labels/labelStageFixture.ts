/**
 * Label records and frame inputs for stage tests: one source of the given descriptions, seen
 * by a pinhole eye at the origin looking down world −z (1600 × 900 px, 60° vertical), with the
 * toggle at 1, no focus, no hover and no occluders unless overridden.
 */

import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { LabelDescription } from '../../../src/@types/rendering/LabelDescription';
import type { LabelFrameInputs } from '../../../src/@types/rendering/LabelFrameInputs';
import type { LabelRecords } from '../../../src/@types/rendering/LabelRecords';
import type { LabelStyleId } from '../../../src/@types/rendering/LabelStyleId';
import { createLabelRecords } from '../../../src/utils/labels/createLabelRecords';
import { encodeLabelSource } from '../../../src/utils/labels/encodeLabelSource';
import { labelSource } from '../../../src/utils/labels/labelSource';
import { symmetricFrustum } from '../../../src/utils/camera/frustum/symmetricFrustum';
import { LABEL_DIRECTORS } from '../../../src/data/labels/labelDirectors';
import { NEAR0 } from '../../../src/services/engine/frame/slabs';
import { LETTER_A_METRICS } from './letterAMetrics';
import { pinholeFixture } from './pinholeFixture';

export const STAGE_CAMERA = pinholeFixture({
  eye: [0, 0, 0],
  forward: [0, 0, -1],
  up: [0, 1, 0],
  frustum: symmetricFrustum(Math.PI / 3, 1600 / 900),
  sizePx: [1600, 900],
});

export function stageRecords(
  descriptions: readonly LabelDescription[],
  style: LabelStyleId = 'galaxyCluster',
): LabelRecords {
  const records = createLabelRecords(16, 256, LETTER_A_METRICS);
  const source = labelSource({
    slab: NEAR0,
    toggle: 'body',
    style,
    items: () => descriptions,
    describe: (d: LabelDescription) => d,
  });
  records.count = encodeLabelSource(source, {} as EngineState, records, 0, 0);
  return records;
}

export function stageInputs(over: Partial<LabelFrameInputs> = {}): LabelFrameInputs {
  return {
    director: LABEL_DIRECTORS.find((row) => row.slab === NEAR0)!,
    projection: STAGE_CAMERA.output,
    bodyStates: new Map(),
    meshBodies: [],
    nowMs: 0,
    toggleFades: [1],
    recessions: [1],
    focusPickId: null,
    hoveredPick: null,
    selectedPick: null,
    focusedOnly: false,
    focus: { center: [0, 0, 0], apparentRadiusMpc: 1, physicalRadiusMpc: 1, blend: 0 },
    occluders: [],
    ...over,
  };
}
