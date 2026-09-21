/**
 * checkFrameOrder — the boot-time cross-check between the authored frame order,
 * the passes the present Layers contributed, and the assembled render-target
 * rows. Nothing type-checks a pass name or a target string, so a typo would
 * otherwise draw nothing, silently; each case here is one such silent failure.
 */

import { describe, it, expect, vi } from 'vitest';

import { checkFrameOrder } from '../../../../src/services/engine/frame/checkFrameOrder';
import { COSMO, NEAR0 } from '../../../../src/services/engine/frame/slabs';
import type { ContentPass } from '../../../../src/@types/engine/frame/ContentPass';
import type { ContentCompute } from '../../../../src/@types/engine/frame/ContentCompute';
import type { FrameStepSpec } from '../../../../src/@types/engine/frame/FrameStepSpec';
import type { RenderTargetSpec } from '../../../../src/@types/engine/frame/RenderTargetSpec';

const TARGETS: readonly Pick<RenderTargetSpec, 'id' | 'depth'>[] = [
  { id: 'hdr', depth: null },
  { id: 'sky-cubemap', depth: null },
  { id: 'foreground:0', depth: 'depth32float' },
  { id: 'swap', depth: null },
];
const NO_COMPUTES: readonly ContentCompute[] = [];

function fakePass(name: string): ContentPass {
  return {
    name,
    enabled: vi.fn<ContentPass['enabled']>(() => true),
    draw: vi.fn<ContentPass['draw']>(),
  };
}

function fakeCompute(name: string): ContentCompute {
  return { name, encode: vi.fn<ContentCompute['encode']>() };
}

const drawing = (...names: string[]): FrameStepSpec[] => [
  { kind: 'render', target: 'hdr', slab: COSMO, passes: names },
];

describe('checkFrameOrder', () => {
  it('throws naming a contributed pass no FRAME_ORDER line draws', () => {
    expect(() =>
      checkFrameOrder(drawing('a'), [fakePass('a'), fakePass('ghost-pass')], NO_COMPUTES, TARGETS),
    ).toThrow(/ghost-pass/);
  });

  it('throws naming a pass listed on two lines', () => {
    const order: FrameStepSpec[] = [
      { kind: 'render', target: 'hdr', slab: COSMO, passes: ['a'] },
      { kind: 'render', target: 'hdr', slab: NEAR0, passes: ['a'] },
    ];
    expect(() => checkFrameOrder(order, [fakePass('a')], NO_COMPUTES, TARGETS)).toThrow(/'a'/);
  });

  it('accepts a pass that only a capture line rosters', () => {
    // A probe's sky blit draws for the capture alone — it is rostered on no
    // render line, and that is not the silent-omission the "no line draws"
    // rule exists to catch.
    const order: FrameStepSpec[] = [
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
        order,
        [fakePass('a'), fakePass('capture-only'), fakePass('body-capture-only')],
        NO_COMPUTES,
        TARGETS,
      ),
    ).not.toThrow();
  });

  it('a probe row contributes no render-target id to the check', () => {
    // The probe's faces are its subject's own cube, so there is no row id for
    // the declared-target check to demand — TARGETS names none for it.
    const order: FrameStepSpec[] = [
      { kind: 'capture', captures: ['probe'], cosmoPasses: [], near0Passes: [], bodyPasses: [] },
      ...drawing('a'),
    ];
    expect(() => checkFrameOrder(order, [fakePass('a')], NO_COMPUTES, TARGETS)).not.toThrow();
  });

  it('throws naming a step target that is not a declared render-target id', () => {
    const order: FrameStepSpec[] = [{ kind: 'render', target: 'hrd', slab: COSMO, passes: ['a'] }];
    expect(() => checkFrameOrder(order, [fakePass('a')], NO_COMPUTES, TARGETS)).toThrow(/hrd/);
  });

  // A Layer-owned target leaves with its Layer; the line naming it expands to nothing.
  it('accepts an undeclared target on a render line whose passes no present Layer owns', () => {
    const order: FrameStepSpec[] = [
      ...drawing('a'),
      { kind: 'render', target: 'layer-only', slab: COSMO, passes: ['absent'] },
    ];
    expect(() => checkFrameOrder(order, [fakePass('a')], NO_COMPUTES, TARGETS)).not.toThrow();
  });

  it('throws naming a composite endpoint that is not a declared render-target id', () => {
    const order: FrameStepSpec[] = [
      ...drawing('a'),
      { kind: 'tonemap', source: 'hdr', dest: 'swop' },
    ];
    expect(() => checkFrameOrder(order, [fakePass('a')], NO_COMPUTES, TARGETS)).toThrow(/swop/);
  });

  it('throws naming a contributed compute row no FRAME_ORDER line runs', () => {
    const order: FrameStepSpec[] = [{ kind: 'compute', name: 'sky-view' }];
    expect(() =>
      checkFrameOrder(order, [], [fakeCompute('sky-view'), fakeCompute('ghost-compute')], TARGETS),
    ).toThrow(/ghost-compute/);
  });

  it('throws naming a compute row listed on two lines', () => {
    const order: FrameStepSpec[] = [
      { kind: 'compute', name: 'flow' },
      { kind: 'compute', name: 'flow' },
    ];
    expect(() => checkFrameOrder(order, [], [fakeCompute('flow')], TARGETS)).toThrow(/'flow'/);
  });

  it('a compute row and a pass sharing one name do not collide in the count', () => {
    // 'flow' names both the ribbon integrator (compute) and the ribbon draw
    // (pass) on purpose — one FRAME_ORDER line of each must not read as
    // "listed twice".
    const order: FrameStepSpec[] = [{ kind: 'compute', name: 'flow' }, ...drawing('flow')];
    expect(() =>
      checkFrameOrder(order, [fakePass('flow')], [fakeCompute('flow')], TARGETS),
    ).not.toThrow();
  });

  it('throws naming a sampled depth source that is not a declared row', () => {
    const order: FrameStepSpec[] = [
      { kind: 'render', target: 'hdr', slab: 0, depth: { sample: 'forground:0' }, passes: ['a'] },
    ];
    expect(() => checkFrameOrder(order, [fakePass('a')], NO_COMPUTES, TARGETS)).toThrow(
      /forground:0/,
    );
  });

  it('throws naming a sampled depth source row that has no depth', () => {
    const order: FrameStepSpec[] = [
      { kind: 'render', target: 'hdr', slab: 0, depth: { sample: 'hdr' }, passes: ['a'] },
    ];
    expect(() => checkFrameOrder(order, [fakePass('a')], NO_COMPUTES, TARGETS)).toThrow(/'hdr'/);
  });
});
