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
import type { FrameStepSpec } from '../../../../src/@types/engine/frame/FrameStepSpec';

const TARGETS = ['hdr', 'sky-cubemap', 'foreground:0', 'swap'];

function fakePass(name: string): ContentPass {
  return {
    name,
    blend: 'additive',
    enabled: vi.fn<ContentPass['enabled']>(() => true),
    draw: vi.fn<ContentPass['draw']>(),
  };
}

const drawing = (...names: string[]): FrameStepSpec[] => [
  { kind: 'render', target: 'hdr', slab: COSMO, passes: names },
];

describe('checkFrameOrder', () => {
  it('throws naming a contributed pass no FRAME_ORDER line draws', () => {
    expect(() =>
      checkFrameOrder(drawing('a'), [fakePass('a'), fakePass('ghost-pass')], TARGETS),
    ).toThrow(/ghost-pass/);
  });

  it('throws naming a pass listed on two lines', () => {
    const order: FrameStepSpec[] = [
      { kind: 'render', target: 'hdr', slab: COSMO, passes: ['a'] },
      { kind: 'render', target: 'hdr', slab: NEAR0, passes: ['a'] },
    ];
    expect(() => checkFrameOrder(order, [fakePass('a')], TARGETS)).toThrow(/'a'/);
  });

  it('throws when a capture roster names a pass no render line draws', () => {
    const order: FrameStepSpec[] = [
      {
        kind: 'capture',
        target: 'sky-cubemap',
        cosmoPasses: ['a'],
        near0Passes: ['not-drawn'],
      },
      ...drawing('a'),
    ];
    expect(() => checkFrameOrder(order, [fakePass('a')], TARGETS)).toThrow(/not-drawn/);
  });

  it('throws naming a step target that is not a declared render-target id', () => {
    const order: FrameStepSpec[] = [{ kind: 'render', target: 'hrd', slab: COSMO, passes: ['a'] }];
    expect(() => checkFrameOrder(order, [fakePass('a')], TARGETS)).toThrow(/hrd/);
  });

  it('throws naming a composite endpoint that is not a declared render-target id', () => {
    const order: FrameStepSpec[] = [
      ...drawing('a'),
      { kind: 'tonemap', source: 'hdr', dest: 'swop' },
    ];
    expect(() => checkFrameOrder(order, [fakePass('a')], TARGETS)).toThrow(/swop/);
  });
});
