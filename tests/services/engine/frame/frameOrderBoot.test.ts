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
import { VIEW_RIGS } from '../../../../src/data/rendering/viewRigs';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { CORE_COMPUTES } from '../../../../src/services/engine/frame/computes';
import { CORE_PLANNERS } from '../../../../src/services/engine/frame/planners';
import { PRELUDE } from '../../../../src/data/rendering/frameSections';
import { composeRenderTargetRows } from '../../../../src/services/engine/layer/composeRenderTargetRows';
import { APP_COMPOSITION } from '../../../../src/compositions/app';
import { stubPlannersFor } from '../../../helpers/frame/stubPlannersFor';

import type { RenderStepSpec } from '../../../../src/@types/engine/frame/RenderStepSpec';

// Unlike `CONTENT_PASSES`/`CORE_COMPUTES`, a `plan` line's planner is never
// optional (Global Constraints), so PRELUDE's Layer-owned rows need a
// stand-in here — this file checks core's artifacts alone, never the full
// `createLayers` composition.
const LAYER_PLANNER_STUBS = stubPlannersFor(PRELUDE);

describe('checkFrameOrder — boot', () => {
  it('every ViewRig’s program passes the boot check', () => {
    // The swap format only decides the swap ROW's format, never an id, so any
    // valid format yields the same rows `startLoop` reads off the assembled
    // table. Every rig, the same set `startLoop` itself checks — not just
    // `FRAME_ORDER` (mono's own concatenation), so a dome-only pass or a
    // section shared by both rigs is exercised here too.
    const targets = composeRenderTargetRows(
      'bgra8unorm',
      APP_COMPOSITION.layers.map((layer) => layer.targets ?? []),
    );
    expect(() =>
      checkFrameOrder(
        Object.values(VIEW_RIGS).map((rig) => rig.program),
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
