/**
 * frameOrderBoot — `checkFrameOrder` over the REAL artifacts the app boots with (the check
 * `startLoop` runs before the first frame). Per-rule cases live in `checkFrameOrder.test.ts`;
 * this binds them to production data, so a core pass missing its `FRAME_ORDER` line fails here
 * instead of never drawing (a Layer's passes are pinned by that Layer's own test). Target ids
 * include every Layer's `targets` via `composeRenderTargetRows`, the table the `renderTargets`
 * GPU-handle row allocates.
 */

import { describe, it, expect } from 'vitest';

import { checkFrameOrder } from '../../../../src/services/engine/frame/checkFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { VIEW_RIGS } from '../../../../src/data/rendering/viewRigs';
import { bodyLayer } from '../../../../src/layers/body/layer';
import type { BodyRuntime } from '../../../../src/layers/body/@types/BodyRuntime';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { PRELUDE, SCENE } from '../../../../src/data/rendering/frameSections';
import { composeRenderTargetRows } from '../../../../src/services/engine/layer/composeRenderTargetRows';
import { APP_COMPOSITION } from '../../../../src/compositions/app';
import { stubPlannersFor } from '../../../helpers/frame/stubPlannersFor';

import type { RenderStepSpec } from '../../../../src/@types/engine/frame/RenderStepSpec';

// A `plan` line's planner is never optional, so PRELUDE's and SCENE's Layer-owned rows need a
// stand-in: this file checks core's artifacts and the body computes, never `createLayers`.
const LAYER_PLANNER_STUBS = [...stubPlannersFor(PRELUDE), ...stubPlannersFor(SCENE)];

describe('checkFrameOrder — boot', () => {
  it('every ViewRig’s program passes the boot check', () => {
    // The swap format only decides the swap ROW's format, never an id. Checks every rig, as
    // `startLoop` does, so a dome-only pass or a section shared by both rigs is exercised.
    const targets = composeRenderTargetRows(
      'bgra8unorm',
      APP_COMPOSITION.layers.map((layer) => layer.targets ?? []),
    );
    expect(() =>
      checkFrameOrder(
        Object.values(VIEW_RIGS).map((rig) => rig.program),
        CONTENT_PASSES,
        bodyLayer.computes!({} as BodyRuntime),
        LAYER_PLANNER_STUBS,
        targets,
      ),
    ).not.toThrow();
  });

  // Dropping the declaration costs the overlays nothing loud: `sampledDepth`
  // goes undefined, every pipeline binds the far placeholder, and the captions
  // simply stop hiding behind terrain. Pinned here rather than eye-checked.
  it('both swap-overlay lines sample foreground:0’s depth', () => {
    const swapLines = FRAME_ORDER.filter(
      (step): step is RenderStepSpec => step.kind === 'render' && step.target === 'swap',
    );
    expect(swapLines).toHaveLength(2);
    for (const line of swapLines) {
      expect(line.depth).toEqual({ sample: 'foreground:0' });
    }
  });
});
