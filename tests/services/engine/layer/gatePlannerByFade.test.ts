/**
 * A once-scope planner gets the band at the anchor view (`views[0]`) only when it sets
 * `hasDistanceBand`; a perView planner always reads its own view's. Losing the band plans work
 * (an SGP4 sweep) for a Layer nothing draws; gaining it drops the survey planner's member count
 * to famous-only inside the deep-zoom band.
 */

import { describe, expect, it, vi } from 'vitest';

import { APP_VISIBILITY_REGISTRY } from '../../../../src/compositions/appVisibility';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { galaxyCatalogPlanner } from '../../../../src/layers/galaxyCatalog/frame';
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
const viewAt = (d: number) =>
  ({ drawCamPos: [d, 0, 0], snapshot: SNAPSHOT }) as unknown as FrameView;
const S = {} as PassState;
const RESULT = { data: null, awake: false };

function makeState(entries: readonly VisibilityEntry[] = [BANDED]) {
  const fades = createFadeRegistry({ requestRender: () => {} });
  fades.register({ address: 'probe' } as never, 1);
  return {
    subsystems: { fades, clipPlayer: { clipOpacityOf: () => 1 } },
    visibilityEntries: entries,
  } as unknown as Pick<EngineState, 'subsystems' | 'visibilityEntries'>;
}

function onceValue(planner: object, state: ReturnType<typeof makeState>, view: FrameView) {
  const plan = vi.fn((..._args: unknown[]) => RESULT);
  const gated = gatePlannerByFade(
    { ...planner, plan } as unknown as FrameContentPlanner<null>,
    state,
  );
  if (gated.scope !== 'once') throw new Error('scope lost');
  gated.plan(SNAPSHOT, [view], S);
  return plan.mock.calls[0]![3];
}

describe('gatePlannerByFade', () => {
  it('a once-scope planner with hasDistanceBand gets the band at views[0]', () => {
    const planner = { name: 'p', scope: 'once', fade: 'probe', hasDistanceBand: true };
    expect(onceValue(planner, makeState(), viewAt(2))).toBe(0);
  });

  it('a once-scope planner without hasDistanceBand gets the band-free value', () => {
    const planner = { name: 'p', scope: 'once', fade: 'probe' };
    expect(onceValue(planner, makeState(), viewAt(2))).toBe(1);
  });

  it('the survey planner keeps its survey catalogs at the home view, inside the deep-zoom band', () => {
    const value = onceValue(
      galaxyCatalogPlanner({} as never),
      makeState(APP_VISIBILITY_REGISTRY),
      viewAt(SCALE_UNITS.AU_TO_MPC),
    ) as Record<string, number>;
    expect(value.sdss).toBe(1);
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
    gated.plan(viewAt(2), S);
    expect(plan.mock.calls[0]![2]).toBe(0);
  });
});
