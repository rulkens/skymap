/**
 * frameOrderBoot — `checkFrameOrder` over the REAL artifacts the app boots
 * with, which is the check `startLoop` runs once before the first frame. The
 * per-rule cases live in `checkFrameOrder.test.ts`; this one binds them to
 * production data, so a Layer that contributes a pass and forgets its
 * `FRAME_ORDER` line fails here instead of silently never drawing. Target ids
 * include every Layer's `targets` too, via `composeRenderTargetRows` — the
 * same composed table the `renderTargets` GPU-handle row allocates.
 */

import { describe, it, expect } from 'vitest';

import { checkFrameOrder } from '../../../../src/services/engine/frame/checkFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { CORE_COMPUTES } from '../../../../src/services/engine/frame/computes';
import { CORE_PLANNERS } from '../../../../src/services/engine/frame/planners';
import { VIEW_RIGS } from '../../../../src/data/rendering/viewRigs';
import { composeRenderTargetRows } from '../../../../src/services/engine/layer/composeRenderTargetRows';
import { APP_COMPOSITION } from '../../../../src/compositions/app';

import type { FrameContentPlanner } from '../../../../src/@types/engine/frame/FrameContentPlanner';
import type { RenderStepSpec } from '../../../../src/@types/engine/frame/RenderStepSpec';

// Unlike `CONTENT_PASSES`/`CORE_COMPUTES`, a `plan` line's planner is never
// optional (Global Constraints), so PRELUDE's three Layer-owned rows need a
// stand-in here — this file checks core's artifacts alone, never the full
// `createLayers` composition. The names mirror PRELUDE's plan lines in
// `frameSections.ts`, where a rename shows up first.
const LAYER_PLANNER_STUBS: readonly FrameContentPlanner<unknown>[] = [
  {
    name: 'galaxy-catalog',
    scope: 'once',
    plan: () => ({ value: undefined, awake: false, settling: false }),
  },
  {
    name: 'flow',
    scope: 'once',
    plan: () => ({ value: undefined, awake: false, settling: false }),
  },
  {
    name: 'star-catalog',
    scope: 'once',
    plan: () => ({ value: undefined, awake: false, settling: false }),
  },
];

describe('checkFrameOrder — boot', () => {
  it('the app’s FRAME_ORDER passes the boot check', () => {
    // The swap format only decides the swap ROW's format, never an id, so any
    // valid format yields the same rows `startLoop` reads off the assembled
    // table.
    const targets = composeRenderTargetRows(
      'bgra8unorm',
      APP_COMPOSITION.layers.map((layer) => layer.targets ?? []),
    );
    expect(() =>
      checkFrameOrder(
        VIEW_RIGS.mono.program,
        CONTENT_PASSES,
        CORE_COMPUTES,
        [...CORE_PLANNERS, ...LAYER_PLANNER_STUBS],
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
