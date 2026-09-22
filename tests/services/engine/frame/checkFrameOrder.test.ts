/**
 * checkFrameOrder — the boot-time cross-check between the authored frame order,
 * the passes/computes/planners the present Layers contributed, and the
 * assembled render-target rows. Nothing type-checks a pass name or a target
 * string, so a typo would otherwise draw nothing, silently; each case here is
 * one such silent failure.
 */

import { describe, it, expect, vi } from 'vitest';

import { checkFrameOrder } from '../../../../src/services/engine/frame/checkFrameOrder';
import { COSMO, NEAR0 } from '../../../../src/services/engine/frame/slabs';
import type { ContentPass } from '../../../../src/@types/engine/frame/ContentPass';
import type { ContentCompute } from '../../../../src/@types/engine/frame/ContentCompute';
import type { ContentPlanner } from '../../../../src/@types/engine/frame/ContentPlanner';
import type { FrameSection } from '../../../../src/@types/engine/frame/FrameSection';
import type { FrameStepSpec } from '../../../../src/@types/engine/frame/FrameStepSpec';
import type { RenderTargetSpec } from '../../../../src/@types/engine/frame/RenderTargetSpec';
import type { SectionScope } from '../../../../src/@types/engine/frame/SectionScope';

const TARGETS: readonly Pick<RenderTargetSpec, 'id' | 'depth'>[] = [
  { id: 'hdr', depth: null },
  { id: 'sky-cubemap', depth: null },
  { id: 'foreground:0', depth: 'depth32float' },
  { id: 'swap', depth: null },
];
const NO_COMPUTES: readonly ContentCompute[] = [];
const NO_PLANNERS: readonly ContentPlanner<unknown>[] = [];

function fakePass(name: string): ContentPass {
  return {
    name,
    enabled: vi.fn<ContentPass['enabled']>(() => true),
    draw: vi.fn<ContentPass['draw']>(),
  };
}

function fakeCompute(name: string, scope: SectionScope = 'once'): ContentCompute {
  return { name, scope, encode: vi.fn<ContentCompute['encode']>() };
}

function fakePlanner(name: string, scope: SectionScope = 'once'): ContentPlanner<unknown> {
  return scope === 'once'
    ? {
        name,
        scope: 'once',
        plan: vi.fn(() => ({ value: undefined, awake: false, settling: false })),
      }
    : {
        name,
        scope: 'perView',
        plan: vi.fn(() => ({ value: undefined, awake: false, settling: false })),
      };
}

/** Wraps a bare step list in one `'once'`-scope section — the shape most of
 *  these cases don't care about. */
const section = (steps: readonly FrameStepSpec[], scope: SectionScope = 'once'): FrameSection => ({
  scope,
  steps,
});

const drawing = (...names: string[]): FrameStepSpec[] => [
  { kind: 'render', target: 'hdr', slab: COSMO, passes: names },
];

describe('checkFrameOrder', () => {
  it('throws naming a contributed pass no FRAME_ORDER line draws', () => {
    expect(() =>
      checkFrameOrder(
        [section(drawing('a'))],
        [fakePass('a'), fakePass('ghost-pass')],
        NO_COMPUTES,
        NO_PLANNERS,
        TARGETS,
      ),
    ).toThrow(/ghost-pass/);
  });

  it('throws naming a pass listed on two lines', () => {
    const steps: FrameStepSpec[] = [
      { kind: 'render', target: 'hdr', slab: COSMO, passes: ['a'] },
      { kind: 'render', target: 'hdr', slab: NEAR0, passes: ['a'] },
    ];
    expect(() =>
      checkFrameOrder([section(steps)], [fakePass('a')], NO_COMPUTES, NO_PLANNERS, TARGETS),
    ).toThrow(/'a'/);
  });

  it('accepts a pass that only a capture line rosters', () => {
    // A probe's sky blit draws for the capture alone — it is rostered on no
    // render line, and that is not the silent-omission the "no line draws"
    // rule exists to catch.
    const steps: FrameStepSpec[] = [
      {
        kind: 'capture',
        captures: ['sgrAStar'],
        cosmoPasses: ['capture-only'],
        near0Passes: [],
        bodyPasses: ['body-capture-only'],
      },
      ...drawing('a'),
    ];
    expect(() =>
      checkFrameOrder(
        [section(steps)],
        [fakePass('a'), fakePass('capture-only'), fakePass('body-capture-only')],
        NO_COMPUTES,
        NO_PLANNERS,
        TARGETS,
      ),
    ).not.toThrow();
  });

  it('a probe row contributes no render-target id to the check', () => {
    // The probe's faces are its subject's own cube, so there is no row id for
    // the declared-target check to demand — TARGETS names none for it.
    const steps: FrameStepSpec[] = [
      { kind: 'capture', captures: ['probe'], cosmoPasses: [], near0Passes: [], bodyPasses: [] },
      ...drawing('a'),
    ];
    expect(() =>
      checkFrameOrder([section(steps)], [fakePass('a')], NO_COMPUTES, NO_PLANNERS, TARGETS),
    ).not.toThrow();
  });

  it('throws naming a step target that is not a declared render-target id', () => {
    const steps: FrameStepSpec[] = [{ kind: 'render', target: 'hrd', slab: COSMO, passes: ['a'] }];
    expect(() =>
      checkFrameOrder([section(steps)], [fakePass('a')], NO_COMPUTES, NO_PLANNERS, TARGETS),
    ).toThrow(/hrd/);
  });

  // A Layer-owned target leaves with its Layer; the line naming it expands to nothing.
  it('accepts an undeclared target on a render line whose passes no present Layer owns', () => {
    const steps: FrameStepSpec[] = [
      ...drawing('a'),
      { kind: 'render', target: 'layer-only', slab: COSMO, passes: ['absent'] },
    ];
    expect(() =>
      checkFrameOrder([section(steps)], [fakePass('a')], NO_COMPUTES, NO_PLANNERS, TARGETS),
    ).not.toThrow();
  });

  it('throws naming a composite endpoint that is not a declared render-target id', () => {
    const steps: FrameStepSpec[] = [
      ...drawing('a'),
      { kind: 'tonemap', source: 'hdr', dest: 'swop' },
    ];
    expect(() =>
      checkFrameOrder([section(steps)], [fakePass('a')], NO_COMPUTES, NO_PLANNERS, TARGETS),
    ).toThrow(/swop/);
  });

  it('throws naming a contributed compute row no FRAME_ORDER line runs', () => {
    const steps: FrameStepSpec[] = [{ kind: 'compute', name: 'sky-view' }];
    expect(() =>
      checkFrameOrder(
        [section(steps)],
        [],
        [fakeCompute('sky-view'), fakeCompute('ghost-compute')],
        NO_PLANNERS,
        TARGETS,
      ),
    ).toThrow(/ghost-compute/);
  });

  it('throws naming a compute row listed on two lines', () => {
    const steps: FrameStepSpec[] = [
      { kind: 'compute', name: 'flow' },
      { kind: 'compute', name: 'flow' },
    ];
    expect(() =>
      checkFrameOrder([section(steps)], [], [fakeCompute('flow')], NO_PLANNERS, TARGETS),
    ).toThrow(/'flow'/);
  });

  it('a compute row and a pass sharing one name do not collide in the count', () => {
    // 'flow' names both the ribbon integrator (compute) and the ribbon draw
    // (pass) on purpose — one FRAME_ORDER line of each must not read as
    // "listed twice".
    const steps: FrameStepSpec[] = [{ kind: 'compute', name: 'flow' }, ...drawing('flow')];
    expect(() =>
      checkFrameOrder(
        [section(steps)],
        [fakePass('flow')],
        [fakeCompute('flow')],
        NO_PLANNERS,
        TARGETS,
      ),
    ).not.toThrow();
  });

  it('throws naming a sampled depth source that is not a declared row', () => {
    const steps: FrameStepSpec[] = [
      { kind: 'render', target: 'hdr', slab: 0, depth: { sample: 'forground:0' }, passes: ['a'] },
    ];
    expect(() =>
      checkFrameOrder([section(steps)], [fakePass('a')], NO_COMPUTES, NO_PLANNERS, TARGETS),
    ).toThrow(/forground:0/);
  });

  it('throws naming a sampled depth source row that has no depth', () => {
    const steps: FrameStepSpec[] = [
      { kind: 'render', target: 'hdr', slab: 0, depth: { sample: 'hdr' }, passes: ['a'] },
    ];
    expect(() =>
      checkFrameOrder([section(steps)], [fakePass('a')], NO_COMPUTES, NO_PLANNERS, TARGETS),
    ).toThrow(/'hdr'/);
  });

  it('throws naming a contributed planner no plan line runs', () => {
    const steps: FrameStepSpec[] = [{ kind: 'plan', name: 'structure-markers' }];
    expect(() =>
      checkFrameOrder(
        [section(steps)],
        [],
        NO_COMPUTES,
        [fakePlanner('structure-markers'), fakePlanner('ghost-planner')],
        TARGETS,
      ),
    ).toThrow(/ghost-planner/);
  });

  it('throws naming a plan row no registered planner declares', () => {
    const steps: FrameStepSpec[] = [{ kind: 'plan', name: 'ghost-planner' }];
    expect(() => checkFrameOrder([section(steps)], [], NO_COMPUTES, NO_PLANNERS, TARGETS)).toThrow(
      /ghost-planner/,
    );
  });

  it('planner on two lines throws', () => {
    const steps: FrameStepSpec[] = [
      { kind: 'plan', name: 'flow' },
      { kind: 'plan', name: 'flow' },
    ];
    expect(() =>
      checkFrameOrder([section(steps)], [], NO_COMPUTES, [fakePlanner('flow')], TARGETS),
    ).toThrow(/'flow'/);
  });

  it('perView planner in a once section throws', () => {
    const steps: FrameStepSpec[] = [{ kind: 'plan', name: 'structure-markers' }];
    expect(() =>
      checkFrameOrder(
        [section(steps, 'once')],
        [],
        NO_COMPUTES,
        [fakePlanner('structure-markers', 'perView')],
        TARGETS,
      ),
    ).toThrow(/structure-markers/);
  });

  it('once compute in a perView section throws', () => {
    const steps: FrameStepSpec[] = [{ kind: 'compute', name: 'sky-view' }];
    expect(() =>
      checkFrameOrder(
        [section(steps, 'perView')],
        [],
        [fakeCompute('sky-view', 'once')],
        NO_PLANNERS,
        TARGETS,
      ),
    ).toThrow(/sky-view/);
  });

  it('plan row after a render row throws', () => {
    const steps: FrameStepSpec[] = [...drawing('a'), { kind: 'plan', name: 'structure-markers' }];
    expect(() =>
      checkFrameOrder(
        [section(steps)],
        [fakePass('a')],
        NO_COMPUTES,
        [fakePlanner('structure-markers')],
        TARGETS,
      ),
    ).toThrow(/lead their section/);
  });
});
