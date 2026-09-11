/**
 * expandFrameOrder — the authored `FRAME_ORDER` plus this frame's inputs into
 * the step list the executor walks.
 */

import { describe, it, expect, vi } from 'vitest';

import { expandFrameOrder } from '../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { COSMO, NEAR0 } from '../../../../src/services/engine/frame/slabs';
import type { ContentPass } from '../../../../src/@types/engine/frame/ContentPass';
import type { FrameStep } from '../../../../src/@types/engine/frame/FrameStep';
import type { ToneMap } from '../../../../src/@types/rendering/ToneMap';

const TONE: ToneMap = { exposure: 1.5, curve: 4, hdrKnee: 0, hdrHeadroom: 0 };

/** The roster a step resolved. */
function namesOf(step: FrameStep | undefined): readonly string[] {
  return step !== undefined && step.kind === 'render' ? step.passes.map((p) => p.name) : [];
}

/** The authored timing-slot suffix a step carries, if any. */
function slotOf(step: FrameStep | undefined): string | undefined {
  return step !== undefined && step.kind === 'render' ? step.slot : 'no step';
}

/** A fake row is enough: expansion reads only `name`. */
function fakePass(name: string): ContentPass {
  return {
    name,
    blend: 'additive',
    enabled: vi.fn<ContentPass['enabled']>(() => true),
    draw: vi.fn<ContentPass['draw']>(),
  };
}

describe('expandFrameOrder', () => {
  it('merges the split hdr roster when the lens emits nothing', () => {
    const program = expandFrameOrder(FRAME_ORDER, CONTENT_PASSES, {
      tone: TONE,
      bloomEnabled: true,
      foregroundChain: [NEAR0],
      skyCubemapFacesToCapture: [],
      lensBodySlabs: [],
    });

    const foregroundAt = program.findIndex(
      (step) => step.kind === 'render' && step.target === 'foreground:0',
    );
    const hdrNear0 = program
      .slice(0, foregroundAt)
      .filter((step) => step.kind === 'render' && step.target === 'hdr' && step.slab === NEAR0);

    expect(hdrNear0).toHaveLength(1);
    const merged = hdrNear0[0];
    expect(namesOf(merged)).toEqual([
      'milky-way-upsample',
      'milky-way',
      'star-points',
      'star-catalog',
      'star-upsample',
      'constellations',
      'body-glints',
    ]);
    // The merged step bills the bare group key, as today: the roster line
    // authors no slot, and the merge keeps the first line's.
    expect(slotOf(merged)).toBeUndefined();
  });

  it('carries each hdr·NEAR0 line’s authored slot through expansion', () => {
    // The GPU-timing slot names are a wire format: `renderStepTimingSlotName`
    // appends these to the group key, and the perf harness + DebugPanel look
    // the result up byte-for-byte. A merge would drop the second line's slot,
    // so the lensing list is non-empty here to keep the three lines apart.
    const program = expandFrameOrder(FRAME_ORDER, CONTENT_PASSES, {
      tone: TONE,
      bloomEnabled: true,
      foregroundChain: [NEAR0],
      skyCubemapFacesToCapture: [],
      lensBodySlabs: [2],
    });

    const slots = program
      .filter((step) => step.kind === 'render' && step.target === 'hdr' && step.slab === NEAR0)
      .map(slotOf);
    expect(slots).toEqual([undefined, 'POST_LENSING', 'POST_FOREGROUND']);
  });

  it('drops a render step whose every pass name is absent', () => {
    const withoutZoa = CONTENT_PASSES.filter((p) => p.name !== 'zone-of-avoidance');
    const program = expandFrameOrder(FRAME_ORDER, withoutZoa, {
      tone: TONE,
      bloomEnabled: true,
      foregroundChain: [NEAR0],
      skyCubemapFacesToCapture: [],
      lensBodySlabs: [],
    });

    expect(program.some((step) => step.kind === 'render' && step.target === 'zoa')).toBe(false);
    const targets = program
      .filter((step) => step.kind === 'render')
      .map((step) => (step.kind === 'render' ? `${step.target}·${step.slab}` : ''));
    expect(targets.slice(0, 3)).toEqual([`volume·${COSMO}`, `hdr·${COSMO}`, `star-aggregates·0`]);
  });

  it('resolves a line in its authored order, dropping names no pass owns', () => {
    const program = expandFrameOrder(
      [{ kind: 'render', target: 'hdr', slab: COSMO, passes: ['b', 'ghost', 'a'] }],
      [fakePass('a'), fakePass('b')],
      {
        tone: TONE,
        bloomEnabled: false,
        foregroundChain: [],
        skyCubemapFacesToCapture: [],
        lensBodySlabs: [],
      },
    );

    expect(namesOf(program[0])).toEqual(['b', 'a']);
  });
});
