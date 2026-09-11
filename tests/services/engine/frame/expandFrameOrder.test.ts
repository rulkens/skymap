/**
 * expandFrameOrder — the authored `FRAME_ORDER` plus this frame's inputs into
 * the step list the executor walks.
 *
 * The two equivalence cases are the one sanctioned mirror in this suite
 * (`testing.md`): their expectation is built by the CURRENT `frameProgram` +
 * the CURRENT executor group filter, an independent expression of the same
 * fact, which is what makes "the authored order reproduces today's frame"
 * checkable at all. Task 9 deletes them along with `frameProgram`.
 */

import { describe, it, expect, vi } from 'vitest';

import { expandFrameOrder } from '../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { frameProgram } from '../../../../src/services/engine/frame/frameProgram';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import {
  COSMO,
  NEAR0,
  isBodySlabIndex,
  matchesHdrPhase,
} from '../../../../src/services/engine/frame/slabs';
import type { ContentPass } from '../../../../src/@types/engine/frame/ContentPass';
import type { FrameStep } from '../../../../src/@types/engine/frame/FrameStep';
import type { ToneMap } from '../../../../src/@types/rendering/ToneMap';

const TONE: ToneMap = { exposure: 1.5, curve: 4, hdrKnee: 0, hdrHeadroom: 0 };

/**
 * The OLD selection rule, lifted verbatim from `executeFrame`'s group filter
 * minus its runtime gates: the four predicates the authored roster replaces.
 * Only the EXPECTED side runs through this — the actual side reads the roster
 * `expandFrameOrder` resolved, or the comparison would be circular.
 */
function selectedByFrameProgram(
  step: FrameStep,
  passes: readonly ContentPass[],
): readonly string[] {
  if (step.kind !== 'render') return [];
  const isCaptureStep = step.face !== undefined;
  return passes
    .filter(
      (p) =>
        (isCaptureStep ? p.skyCapture === true : p.target === step.target) &&
        (p.slab === step.slab || (p.slab === 'body' && isBodySlabIndex(step.slab))) &&
        matchesHdrPhase(p.hdrPhase, step.hdrPhases),
    )
    .map((p) => p.name);
}

/** Every field the two programs must agree on, flattened for a deep-equal. */
function comparable(step: FrameStep, names: readonly string[]): unknown {
  if (step.kind === 'render') {
    return {
      kind: step.kind,
      target: step.target,
      slab: step.slab,
      depthLoad: step.depthLoad,
      face: step.face,
      passes: names,
    };
  }
  if (step.kind === 'composite') {
    return {
      kind: step.kind,
      source: step.step.source,
      dest: step.step.dest,
      tone: step.step.tone,
    };
  }
  if (step.kind === 'compute') return { kind: step.kind, name: step.name };
  return { kind: step.kind };
}

const expected = (program: readonly FrameStep[]): unknown[] =>
  program.map((step) => comparable(step, selectedByFrameProgram(step, CONTENT_PASSES)));

const actual = (program: readonly FrameStep[]): unknown[] =>
  program.map((step) =>
    comparable(step, step.kind === 'render' ? (step.passes ?? []).map((p) => p.name) : []),
  );

/** The roster a step resolved, for the cases that read one step directly. */
function namesOf(step: FrameStep | undefined): readonly string[] {
  return step !== undefined && step.kind === 'render' ? (step.passes ?? []).map((p) => p.name) : [];
}

/** A fake row is enough: expansion reads only `name`. */
function fakePass(name: string): ContentPass {
  return {
    name,
    slab: COSMO,
    target: 'hdr',
    blend: 'additive',
    enabled: vi.fn<ContentPass['enabled']>(() => true),
    draw: vi.fn<ContentPass['draw']>(),
  };
}

describe('expandFrameOrder', () => {
  it('expands to the same program frameProgram builds, out of the lensing band', () => {
    const program = expandFrameOrder(FRAME_ORDER, CONTENT_PASSES, {
      tone: TONE,
      bloomEnabled: true,
      foregroundChain: [NEAR0, 2, 3],
      skyCubemapFacesToCapture: [],
      lensBodySlabs: [],
    });

    expect(actual(program)).toEqual(expected(frameProgram(TONE, true, [NEAR0, 2, 3], [], [])));
  });

  it('expands to the same program frameProgram builds, inside the lensing band', () => {
    const program = expandFrameOrder(FRAME_ORDER, CONTENT_PASSES, {
      tone: TONE,
      bloomEnabled: true,
      foregroundChain: [NEAR0, 2, 3],
      skyCubemapFacesToCapture: [0, 1, 2, 3, 4, 5],
      lensBodySlabs: [2],
    });

    expect(actual(program)).toEqual(
      expected(frameProgram(TONE, true, [NEAR0, 2, 3], [0, 1, 2, 3, 4, 5], [2])),
    );
  });

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
    expect(
      merged !== undefined && merged.kind === 'render' ? merged.slot : 'no step',
    ).toBeUndefined();
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
