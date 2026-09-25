/**
 * expandFrameOrder — the authored `FRAME_ORDER` plus this frame's inputs into
 * the step list the executor walks.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { expandFrameOrder } from '../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { FRAME_ORDER_PASS_NAMES } from '../../../../src/services/engine/frame/frameOrderPassNames';
import { COSMO, NEAR0, deriveSlabs } from '../../../../src/services/engine/frame/slabs';
import type { CaptureFaceInput } from '../../../../src/@types/engine/frame/CaptureFaceInput';
import type { ContentPass } from '../../../../src/@types/engine/frame/ContentPass';
import type { CubeFace } from '../../../../src/@types/rendering/CubeFace';
import type { FrameStep } from '../../../../src/@types/engine/frame/FrameStep';
import type { FrameStepSpec } from '../../../../src/@types/engine/frame/FrameStepSpec';
import type { FrameInputs } from '../../../../src/services/engine/frame/expandFrameOrder';
import type { ToneMap } from '../../../../src/@types/rendering/ToneMap';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import { symmetricFrustum } from '../../../../src/utils/camera/symmetricFrustum';

const TONE: ToneMap = { exposure: 1.5, curve: 4, hdrKnee: 0, hdrHeadroom: 0 };

/** The roster a step resolved. */
function namesOf(step: FrameStep | undefined): readonly string[] {
  return step !== undefined && step.kind === 'render' ? step.passes.map((p) => p.name) : [];
}

/** The authored timing-slot suffix a step carries, if any. */
function slotOf(step: FrameStep | undefined): string | undefined {
  return step !== undefined && step.kind === 'render' ? step.slot : 'no step';
}

/** A sky row's face: no body row to draw. */
function skyFace(face: CubeFace): CaptureFaceInput {
  return { face, bodySlabs: [] };
}

/** A fake row is enough: expansion reads only `name`. */
function fakePass(name: string): ContentPass {
  return {
    name,
    enabled: vi.fn<ContentPass['enabled']>(() => true),
    draw: vi.fn<ContentPass['draw']>(),
  };
}

/**
 * The COMPOSED pass list `createLayers` writes: core's registry plus a name-only
 * stub for every authored name a Layer contributes (Ruling 2). Expansion reads
 * only `name`, so the stubs are enough to exercise the roster.
 */
const COMPOSED_PASSES: readonly ContentPass[] = [
  ...CONTENT_PASSES,
  ...FRAME_ORDER_PASS_NAMES.filter((name) => !CONTENT_PASSES.some((p) => p.name === name)).map(
    fakePass,
  ),
];

/** The real order + composed registry, with only the per-frame lists varied. */
function program(over: Partial<FrameInputs> = {}): readonly FrameStep[] {
  return expandFrameOrder(FRAME_ORDER, COMPOSED_PASSES, {
    tone: TONE,
    bloomEnabled: false,
    foregroundChain: [NEAR0],
    captureFaces: new Map(),
    bodyRowSlabs: { lens: [], insideAtmosphere: [] },
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
    const program = expandFrameOrder(FRAME_ORDER, COMPOSED_PASSES, {
      tone: TONE,
      bloomEnabled: true,
      foregroundChain: [NEAR0],
      captureFaces: new Map(),
      bodyRowSlabs: { lens: [], insideAtmosphere: [] },
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
      'local-bubble',
      'star-points',
      'star-catalog',
      'star-upsample',
      'constellations',
      'body-glints',
      'black-hole-marker',
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
    const program = expandFrameOrder(FRAME_ORDER, COMPOSED_PASSES, {
      tone: TONE,
      bloomEnabled: true,
      foregroundChain: [NEAR0],
      captureFaces: new Map(),
      bodyRowSlabs: { lens: [2], insideAtmosphere: [] },
    });

    const slots = program
      .filter((step) => step.kind === 'render' && step.target === 'hdr' && step.slab === NEAR0)
      .map(slotOf);
    expect(slots).toEqual([undefined, 'POST_LENSING', 'POST_FOREGROUND']);
  });

  it('drops a render step whose every pass name is absent', () => {
    const withoutZoa = COMPOSED_PASSES.filter((p) => p.name !== 'zone-of-avoidance');
    const program = expandFrameOrder(FRAME_ORDER, withoutZoa, {
      tone: TONE,
      bloomEnabled: true,
      foregroundChain: [NEAR0],
      captureFaces: new Map(),
      bodyRowSlabs: { lens: [], insideAtmosphere: [] },
    });

    expect(program.some((step) => step.kind === 'render' && step.target === 'zoa')).toBe(false);
    const targets = program
      .filter((step) => step.kind === 'render')
      .map((step) => (step.kind === 'render' ? `${step.target}·${step.slab}` : ''));
    expect(targets.slice(0, 3)).toEqual([
      `cosmic-web-density·${COSMO}`,
      `hdr·${COSMO}`,
      `star-aggregates·0`,
    ]);
  });

  it('resolves a line in its authored order, dropping names no pass owns', () => {
    const program = expandFrameOrder(
      [{ kind: 'render', target: 'hdr', slab: COSMO, passes: ['b', 'ghost', 'a'] }],
      [fakePass('a'), fakePass('b')],
      {
        tone: TONE,
        bloomEnabled: false,
        foregroundChain: [],
        captureFaces: new Map(),
        bodyRowSlabs: { lens: [], insideAtmosphere: [] },
      },
    );

    expect(namesOf(program[0])).toEqual(['b', 'a']);
  });

  it('every capture-line pass name is an AUTHORED frame-order name', () => {
    // `resolve` drops unknown names silently, and no render line counts a
    // capture-only pass, so a rename missed on a capture line fails nowhere
    // else. The roster is the authored names (Ruling 2), not core's own
    // implementations: a Layer contributes some of these at runtime.
    const known = new Set(FRAME_ORDER_PASS_NAMES);
    const captureNames = FRAME_ORDER.flatMap((line) =>
      line.kind === 'capture' ? [...line.cosmoPasses, ...line.near0Passes, ...line.bodyPasses] : [],
    );
    expect(captureNames.filter((name) => !known.has(name))).toEqual([]);
  });
});

describe('expandFrameOrder — the per-frame fan-outs', () => {
  it('emits a COSMO capture step alongside NEAR0 per requested face, row by row', () => {
    // The fixed opt-in roster spans both slabs — `point-sprites`/
    // `textured-disks` (COSMO), `star-aggregates`/`star-catalog` (NEAR0) — and a
    // render step is the unit of pass encoding, so each requested face must get
    // ONE step per slab. A NEAR0-only step would leave the COSMO half of the
    // roster permanently undrawn. The line names several rows, which bake one
    // after the other in the order named.
    const steps = program({
      captureFaces: new Map([
        ['sgrAStar', [skyFace(0), skyFace(2)]],
        ['solarSystem', [skyFace(1)]],
      ]),
    });
    const capture = steps.filter((step) => step.kind === 'render' && step.capture !== undefined);
    expect(
      capture.map((step) =>
        step.kind === 'render' ? [step.slab, step.capture?.key, step.capture?.face] : null,
      ),
    ).toEqual([
      [COSMO, 'sgrAStar', 0],
      [NEAR0, 'sgrAStar', 0],
      [COSMO, 'sgrAStar', 2],
      [NEAR0, 'sgrAStar', 2],
      [COSMO, 'solarSystem', 1],
      [NEAR0, 'solarSystem', 1],
    ]);
    // The captures ride the PRELUDE compute pair, ahead of every other render
    // step, so a same-frame lensing draw can sample a cubemap this frame
    // actually wrote. `aerial-perspective` is SCENE's own compute now (a
    // perView row) and so lands after every PRELUDE step, including these.
    expect(steps[0]).toEqual({ kind: 'compute', name: 'flow' });
    expect(steps[1]).toEqual({ kind: 'compute', name: 'sky-view' });
    expect(steps[2]).toBe(capture[0]);
    expect(steps[capture.length + 2]).toEqual({ kind: 'compute', name: 'aerial-perspective' });
  });

  it("expands a face's body slabs into depth-clearing capture steps after its COSMO/NEAR0 pair", () => {
    // A probe face sees its subject's host: after the sky pair, one step per
    // body row the face schedules, each restarting depth the way the foreground
    // chain does — a nearer row must not test against a farther row's depth.
    const order: FrameStepSpec[] = [
      {
        kind: 'capture',
        captures: ['probe'],
        cosmoPasses: ['sky'],
        near0Passes: ['stars'],
        bodyPasses: ['mesh'],
      },
    ];
    const steps = expandFrameOrder(order, [fakePass('sky'), fakePass('stars'), fakePass('mesh')], {
      tone: TONE,
      bloomEnabled: false,
      foregroundChain: [],
      captureFaces: new Map([['probe', [{ face: 4, bodySlabs: [3, 2] }]]]),
      bodyRowSlabs: { lens: [], insideAtmosphere: [] },
    });
    expect(
      steps.map((step) =>
        step.kind === 'render' ? [step.slab, step.capture?.face, step.depth, namesOf(step)] : null,
      ),
    ).toEqual([
      [COSMO, 4, undefined, ['sky']],
      [NEAR0, 4, undefined, ['stars']],
      [3, 4, 'clear', ['mesh']],
      [2, 4, 'clear', ['mesh']],
    ]);
  });

  it('a face with no body slabs expands to the COSMO/NEAR0 pair only', () => {
    const order: FrameStepSpec[] = [
      {
        kind: 'capture',
        captures: ['sgrAStar'],
        cosmoPasses: ['sky'],
        near0Passes: ['stars'],
        bodyPasses: ['mesh'],
      },
    ];
    const steps = expandFrameOrder(order, [fakePass('sky'), fakePass('stars'), fakePass('mesh')], {
      tone: TONE,
      bloomEnabled: false,
      foregroundChain: [],
      captureFaces: new Map([['sgrAStar', [skyFace(0)]]]),
      bodyRowSlabs: { lens: [], insideAtmosphere: [] },
    });
    expect(steps.map((step) => (step.kind === 'render' ? step.slab : null))).toEqual([
      COSMO,
      NEAR0,
    ]);
  });

  it('emits no capture steps when no faces are requested (Q6 zero-dispatch)', () => {
    expect(program().some((step) => step.kind === 'render' && step.capture !== undefined)).toBe(
      false,
    );
    // An entry present but empty is the same nothing: `renderFrame` always keys
    // the map, whether or not this frame bakes.
    const empty = program({
      captureFaces: new Map([
        ['sgrAStar', []],
        ['solarSystem', []],
      ]),
    });
    expect(empty.some((step) => step.kind === 'render' && step.capture !== undefined)).toBe(false);
  });

  it('expands the foreground chain in painter order', () => {
    // Chain [NEAR0, 3, 2] — an out-of-numeric-order chain, as a painter-order
    // chain legitimately is (index order is assignment order, not draw order):
    // consecutive foreground:0 steps in that exact sequence, each row opening
    // with `depth: 'clear'` so a nearer row's depth test starts fresh rather than
    // fighting a farther row's; a body row then splits around its contact-shadow
    // depth sample. The following composite is unmoved.
    const steps = program({ foregroundChain: [NEAR0, 3, 2] });
    const first = steps.findIndex(
      (step) => step.kind === 'render' && step.target === 'foreground:0',
    );
    expect(
      steps
        .slice(first, first + 7)
        .map((step) => (step.kind === 'render' ? [step.slab, step.depth] : null)),
    ).toEqual([
      [NEAR0, 'clear'],
      [3, 'clear'],
      [3, { sample: 'foreground:0' }],
      [3, 'load'],
      [2, 'clear'],
      [2, { sample: 'foreground:0' }],
      [2, 'load'],
    ]);
    expect(steps[first + 7]).toEqual({
      kind: 'composite',
      step: { source: 'foreground:0', dest: 'hdr', blend: 'over', tone: null },
    });
  });

  /** One foreground line over `chain`, every name a fake pass. */
  function foreground(
    chain: readonly number[],
    bodyPasses: Extract<FrameStepSpec, { kind: 'foreground' }>['bodyPasses'],
  ): readonly FrameStep[] {
    const order: FrameStepSpec[] = [
      { kind: 'foreground', target: 'foreground:0', near0Passes: ['stars'], bodyPasses },
    ];
    return expandFrameOrder(order, ['stars', 'a', 'b', 'd'].map(fakePass), {
      tone: TONE,
      bloomEnabled: false,
      foregroundChain: chain,
      captureFaces: new Map(),
      bodyRowSlabs: { lens: [], insideAtmosphere: [] },
    });
  }

  it('a depth-sampling marker splits a body row into clear, sample and load', () => {
    const steps = foreground([3], ['a', { sampleDepth: ['d'] }, 'b']);
    expect(
      steps.map((step) =>
        step.kind === 'render' ? [namesOf(step), step.depth, step.slot, step.slab] : null,
      ),
    ).toEqual([
      [['a'], 'clear', undefined, 3],
      [['d'], { sample: 'foreground:0' }, 'SAMPLE_DEPTH', 3],
      [['b'], 'load', 'AFTER_DEPTH', 3],
    ]);
  });

  it('the real body roster samples depth after every opaque row and both shells', () => {
    // The two rows in the marker READ that depth: the contact decals project
    // onto it, and the atmosphere shell classifies each ray by it. Anything
    // that stamps depth must therefore be listed before them, and only the
    // meshes — which want the shell already drawn behind them — after.
    const steps = program({ foregroundChain: [3] });
    const first = steps.findIndex(
      (step) => step.kind === 'render' && step.target === 'foreground:0',
    );
    expect(namesOf(steps[first + 1])).toEqual(['contact-shadows', 'atmosphere-shell']);
    expect(namesOf(steps[first + 2])).toEqual(['mesh-bodies']);
  });

  it('refuses a body roster with a second marker', () => {
    expect(() =>
      foreground([3], ['a', { sampleDepth: ['d'] }, 'b', { sampleDepth: ['d'] }]),
    ).toThrow('at most one sampleDepth marker');
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
    const steps = program({ bodyRowSlabs: { lens: [4], insideAtmosphere: [] } });
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

  it('a render line with a BodyRowSource slab expands once per resolved row', () => {
    // Painter order is the frame's, not the index's: the rows come out in the
    // order the list holds them, so a nearer row drawn second stays second.
    const steps = program({ bodyRowSlabs: { lens: [3, 2], insideAtmosphere: [] } });
    expect(
      steps
        .filter((step) => step.kind === 'render' && step.slab >= 2)
        .map((step) => (step.kind === 'render' ? step.slab : null)),
    ).toEqual([3, 2]);
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
    const cam = makeCam();
    const slabs = deriveSlabs({
      cam,
      frustum: symmetricFrustum(cam.fovYRad, cam.aspect),
      cosmoVp: new Float32Array(16) as unknown as Mat4,
      altitudeMpc: cam.distance,
      pose: () => null,
      visibleRows: [],
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
