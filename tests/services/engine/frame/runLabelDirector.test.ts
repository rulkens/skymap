import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { LabelDescription } from '../../../../src/@types/rendering/LabelDescription';
import type { LabelDirectorState } from '../../../../src/@types/rendering/LabelDirectorState';
import { runLabelDirector } from '../../../../src/services/engine/frame/runLabelDirector';
import { createLabelDirectorState } from '../../../../src/services/engine/labels/createLabelDirectorState';
import { shownLabelRecords } from '../../../../src/services/engine/labels/shownLabelRecords';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { ZERO_FOCUS } from '../../../../src/services/engine/subsystems/recedingFocusSubsystem';
import { LABEL_DIRECTORS } from '../../../../src/data/labels/labelDirectors';
import { APP_VISIBILITY_REGISTRY } from '../../../../src/compositions/appVisibility';
import { labelSource } from '../../../../src/utils/labels/labelSource';
import { packPickWord } from '../../../../src/utils/labels/packPickWord';
import { LETTER_A_METRICS } from '../../../helpers/labels/letterAMetrics';

// The toggle fade, the camera and the scene's bodies come from the frame; the director's own
// work (encode, stages, idle) runs for real.
const toggle = vi.hoisted(() => ({ fade: 1 }));
vi.mock('../../../../src/services/engine/presentation/resolveViewFadeValue', () => ({
  resolveViewFadeValue: () => toggle.fade,
}));
vi.mock('../../../../src/services/engine/frame/sceneOccluderBodies', () => ({
  sceneOccluderBodies: () => [],
}));
vi.mock('../../../../src/utils/labels/outputProjectionOf', async () => {
  const { STAGE_CAMERA: camera } = await import('../../../helpers/labels/labelStageFixture');
  return { outputProjectionOf: () => camera.output };
});

const JUPITER_PICK = packPickWord(1, 0);
const jupiter: LabelDescription = {
  text: 'A',
  position: [0, 0, -1],
  pick: { code: 1, index: 0 },
};
const other: LabelDescription = { text: 'A', position: [0.3, 0, -1] };

function harness(descriptions: readonly LabelDescription[]) {
  const director: LabelDirectorState = createLabelDirectorState(
    LABEL_DIRECTORS.find((row) => row.slab === NEAR0)!,
  );
  director.sources.push(
    labelSource({
      slab: NEAR0,
      toggle: 'body',
      style: 'constellation',
      items: () => descriptions,
      describe: (d: LabelDescription) => d,
    }) as never,
  );
  const state = {
    subsystems: { labelDirectors: [director] },
    gpu: { fontAtlases: { metricsByFont: LETTER_A_METRICS }, labelRendererNear: null },
    viewRig: 'mono',
    selectionKindRows: [{ type: 'body', encodePick: () => JUPITER_PICK }],
    selection: { focus: null, hover: null, select: null },
    settings: { labels: { focusedOnly: false } },
    visibilityEntries: APP_VISIBILITY_REGISTRY,
  } as unknown as EngineState;
  let nowMs = 0;
  const run = (): boolean => {
    nowMs += 1000;
    const ctx = {
      snapshot: {
        bodyStates: new Map(),
        meshBodies: [],
        nowMs,
        focus: ZERO_FOCUS,
        focusBlend: 0,
        focusPickId: null,
      },
    } as unknown as FrameView;
    return runLabelDirector(state, ctx, NEAR0);
  };
  return { director, state, run };
}

describe('runLabelDirector', () => {
  beforeEach(() => {
    toggle.fade = 1;
  });

  it("focused-only keeps a focused body's label", () => {
    const { director, state, run } = harness([jupiter, other]);
    Object.assign(state.selection, { focus: { type: 'body', id: 'jupiter' } });
    Object.assign(state.settings.labels, { focusedOnly: true });
    run();
    expect(Array.from(director.frame!.target.subarray(0, 2))).toEqual([1, 0]);
  });

  it('an idle director skips its stages and wakes when its toggle comes back', () => {
    const { director, state, run } = harness([other]);
    run();
    expect(shownLabelRecords(state, NEAR0)).not.toBeNull();
    toggle.fade = 0;
    while (run());
    run();
    expect(director.idle).toBe(true);
    expect(shownLabelRecords(state, NEAR0)).toBeNull();
    toggle.fade = 1;
    run();
    expect(director.idle).toBe(false);
    expect(director.frame!.target[0]).toBe(1);
  });
});
