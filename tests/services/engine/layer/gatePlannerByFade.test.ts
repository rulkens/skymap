/**
 * A once-scope planner reads the band at the canvas view (`views[0]`), as a once-scope compute
 * does; a perView planner reads its own view's. A once-scope planner losing the band plans work
 * (an SGP4 sweep) for a Layer nothing draws.
 */

import { describe, expect, it, vi } from 'vitest';

import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { gatePlannerByFade } from '../../../../src/services/engine/layer/gatePlannerByFade';
import type { FrameContentPlanner } from '../../../../src/@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { VisibilityEntry } from '../../../../src/@types/engine/layer/VisibilityEntry';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

// Band 0 beyond 1 Mpc; the views sit at 2.
const BANDED: VisibilityEntry = { key: 'probe', bands: { near: { out: [0, 1] } } };
const SNAPSHOT = { nowMs: 0, bodyStates: new Map() } as unknown as ReadyFrameContext;
const viewAt2 = () => ({ drawCamPos: [2, 0, 0], snapshot: SNAPSHOT }) as unknown as FrameView;
const S = {} as PassState;
const RESULT = { data: null, awake: false };

function makeState() {
  const fades = createFadeRegistry({ requestRender: () => {} });
  fades.register({ address: 'probe' } as never, 1);
  return {
    subsystems: { fades, clipPlayer: { clipOpacityOf: () => 1 } },
    visibilityEntries: [BANDED],
  } as unknown as Pick<EngineState, 'subsystems' | 'visibilityEntries'>;
}

describe('gatePlannerByFade', () => {
  it('a once-scope planner gets the band at the canvas view, and none without a view', () => {
    const plan = vi.fn((..._args: unknown[]) => RESULT);
    const planner = {
      name: 'p',
      scope: 'once',
      fade: 'probe',
      plan,
    } as unknown as FrameContentPlanner<null>;
    const gated = gatePlannerByFade(planner, makeState());
    if (gated.scope !== 'once') throw new Error('scope lost');
    gated.plan(SNAPSHOT, [viewAt2()], S);
    expect(plan.mock.calls[0]![3]).toBe(0);
    gated.plan(SNAPSHOT, [], S);
    expect(plan.mock.calls[1]![3]).toBe(1);
  });

  it('a perView planner gets its view band', () => {
    const plan = vi.fn((..._args: unknown[]) => RESULT);
    const planner = {
      name: 'p',
      scope: 'perView',
      fade: 'probe',
      plan,
    } as unknown as FrameContentPlanner<null>;
    const gated = gatePlannerByFade(planner, makeState());
    if (gated.scope !== 'perView') throw new Error('scope lost');
    gated.plan(viewAt2(), S);
    expect(plan.mock.calls[0]![2]).toBe(0);
  });
});
