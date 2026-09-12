/**
 * expandFrameOrder — the authored `FRAME_ORDER` plus this frame's inputs into
 * the step list the executor walks.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { expandFrameOrder } from '../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { COSMO, NEAR0, deriveSlabs } from '../../../../src/services/engine/frame/slabs';
import type { ContentPass } from '../../../../src/@types/engine/frame/ContentPass';
import type { FrameStep } from '../../../../src/@types/engine/frame/FrameStep';
import type { FrameInputs } from '../../../../src/services/engine/frame/expandFrameOrder';
import type { ToneMap } from '../../../../src/@types/rendering/ToneMap';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';

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
    enabled: vi.fn<ContentPass['enabled']>(() => true),
    draw: vi.fn<ContentPass['draw']>(),
  };
}

/** The real order + registry, with only the per-frame lists varied. */
function program(over: Partial<FrameInputs> = {}): readonly FrameStep[] {
  return expandFrameOrder(FRAME_ORDER, CONTENT_PASSES, {
    tone: TONE,
    bloomEnabled: false,
    foregroundChain: [NEAR0],
    skyCubemapFacesToCapture: [],
    lensBodySlabs: [],
    ...over,
  });
}

function makeCam(): OrbitCamera {
  return {
    target: [0, 0, 0] as unknown as Float32Array,
    distance: 5,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([0, 0, 5]),
  } as unknown as OrbitCamera;
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

describe('expandFrameOrder — the per-frame fan-outs', () => {
  it('emits a COSMO capture step alongside NEAR0 per requested face', () => {
    // The fixed opt-in roster spans both slabs — `point-sprites`/
    // `textured-disks` (COSMO), `star-aggregates`/`star-catalog` (NEAR0) — and a
    // render step is the unit of pass encoding, so each requested face must get
    // ONE step per slab. A NEAR0-only step would leave the COSMO half of the
    // roster permanently undrawn.
    const steps = program({ skyCubemapFacesToCapture: [0, 2] });
    const capture = steps.filter((step) => step.kind === 'render' && step.target === 'sky-cubemap');
    expect(capture.map((step) => (step.kind === 'render' ? [step.slab, step.face] : null))).toEqual(
      [
        [COSMO, 0],
        [NEAR0, 0],
        [COSMO, 2],
        [NEAR0, 2],
      ],
    );
    // Ahead of every other render step, so a same-frame lensing draw can
    // sample a cubemap this frame actually wrote.
    expect(steps[0]).toEqual({ kind: 'compute', name: 'flow' });
    expect(steps[1]).toEqual({ kind: 'compute', name: 'atmosphereSkyView' });
    expect(steps[2]).toBe(capture[0]);
  });

  it('emits no capture steps when no faces are requested (Q6 zero-dispatch)', () => {
    expect(program().some((step) => step.kind === 'render' && step.target === 'sky-cubemap')).toBe(
      false,
    );
  });

  it('expands the foreground chain in painter order', () => {
    // Chain [NEAR0, 3, 2] — an out-of-numeric-order chain, as a painter-order
    // chain legitimately is (index order is assignment order, not draw order):
    // three consecutive foreground:0 steps in that exact sequence, each
    // `depthLoad: 'clear'` so a nearer row's depth test starts fresh rather than
    // fighting a farther row's. The following composite is unmoved.
    const steps = program({ foregroundChain: [NEAR0, 3, 2] });
    const first = steps.findIndex(
      (step) => step.kind === 'render' && step.target === 'foreground:0',
    );
    expect(
      steps
        .slice(first, first + 3)
        .map((step) => (step.kind === 'render' ? [step.slab, step.depthLoad] : null)),
    ).toEqual([
      [NEAR0, 'clear'],
      [3, 'clear'],
      [2, 'clear'],
    ]);
    expect(steps[first + 3]).toEqual({
      kind: 'composite',
      step: { source: 'foreground:0', dest: 'hdr', blend: 'over', tone: null },
    });
  });

  it('emits no foreground chain step for an empty chain, but keeps the composite', () => {
    // No star sphere resolved and no bodies visible. A frame with no bodies must
    // still composite a CLEARED target: `executeFrame`'s composite step skips on
    // an untouched source, so this is a no-op at runtime, but dropping the step
    // would leave a later chain-emitting frame's touched bookkeeping one step
    // off.
    const steps = program({ foregroundChain: [] });
    expect(steps.some((step) => step.kind === 'render' && step.target === 'foreground:0')).toBe(
      false,
    );
    expect(
      steps.some(
        (step) =>
          step.kind === 'composite' &&
          step.step.source === 'foreground:0' &&
          step.step.dest === 'hdr',
      ),
    ).toBe(true);
  });

  it('emits an (hdr, slab) lens step per entry, after (hdr, NEAR0) and before the foreground chain', () => {
    // Positioned so the lens's OVER blend occludes the (hdr, NEAR0) roster
    // already accumulated above it, and so the unwarped POST_LENSING line lands
    // on top of it.
    const steps = program({ lensBodySlabs: [4] });
    const rosterIdx = steps.findIndex(
      (step) => step.kind === 'render' && step.target === 'hdr' && step.slab === NEAR0,
    );
    const lens = steps[rosterIdx + 1];
    expect(lens?.kind === 'render' ? [lens.target, lens.slab] : null).toEqual(['hdr', 4]);
    const foregroundIdx = steps.findIndex(
      (step) => step.kind === 'render' && step.target === 'foreground:0',
    );
    expect(rosterIdx + 1).toBeLessThan(foregroundIdx);
  });

  it('emits no lens step for an empty lensing list (zero-cost outside the band)', () => {
    expect(program().some((step) => step.kind === 'render' && step.slab >= 2)).toBe(false);
  });

  it('exactly one composite is tone-mapped', () => {
    // The frame has a SINGLE tone-map. The foreground:0→hdr composite runs in
    // LINEAR space (tone: null) so the bodies join HDR before the curve; the
    // hdr→swap replace-composite carries the one real tone object (identity, not
    // just equal values). That lone tone-map is what gives the frame one curve.
    const composites = program().filter((step) => step.kind === 'composite');
    const [foreground, toneMap] = composites;
    if (foreground?.kind !== 'composite' || toneMap?.kind !== 'composite') {
      throw new Error('expected two composite steps');
    }
    expect(foreground.step).toMatchObject({ source: 'foreground:0', dest: 'hdr', tone: null });
    expect(toneMap.step).toMatchObject({ source: 'hdr', dest: 'swap' });
    expect(toneMap.step.tone).toBe(TONE);
    expect(
      composites.filter((step) => step.kind === 'composite' && step.step.tone !== null),
    ).toHaveLength(1);
  });

  it('bloom is the only input that changes the step list', () => {
    // Bloom-off is the base program; bloom-on is that base with exactly ONE
    // `{ kind: 'bloom' }` step spliced in — nothing else moves, which is what
    // lets `strength`/`threshold` be read live by the bloom passes each draw.
    const off = program();
    const on = program({ bloomEnabled: true });
    expect(on.filter((step) => step.kind === 'bloom')).toEqual([{ kind: 'bloom' }]);
    expect(off.some((step) => step.kind === 'bloom')).toBe(false);
    expect(on.filter((step) => step.kind !== 'bloom')).toEqual(off);
  });

  it('every render step references only slabs present in deriveSlabs’ table', () => {
    // A render step naming an index outside that table throws in `slabViewOf`
    // the moment it runs, so a typo'd `slab` in FRAME_ORDER is a frame-1 crash.
    const slabs = deriveSlabs({
      cam: makeCam(),
      cosmoVp: new Float32Array(16) as unknown as Mat4,
      pivotRadiusMpc: null,
      pose: () => null,
      visibleBodies: [],
      viewportPx: [1920, 1080],
      starSphereRangeM: null,
    });
    for (const step of program({ bloomEnabled: true })) {
      if (step.kind === 'render') {
        expect([NEAR0, COSMO]).toContain(step.slab);
        expect(slabs[step.slab]).toBeDefined();
      }
    }
  });
});
