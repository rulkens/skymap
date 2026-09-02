/**
 * frameProgram — unit tests for the FRAME program literal and the
 * `timedSlotsOf` derivation.
 *
 * The whole point of `frameProgram` is that a frame's order is *data*: an
 * inspectable `FrameStep[]` rather than a hand-wired call sequence. These
 * tests exploit exactly that — they deep-equal the program against its
 * literal and read the derived timing slots straight off the array, with no
 * GPU device in sight.
 *
 * `timedSlotsOf` is driven here with small hand-built fake registries (two
 * `ContentLayer` rows apiece): at this task the real `scalar-volume` layer
 * doesn't exist yet, so the real-`CONTENT_LAYERS` assertion is deferred to
 * task 7. The fakes exercise the same three rules — layers per render step
 * in registry order, `'<source>→<dest>'` per composite, `'pick'` last.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import {
  frameProgram,
  timedSlotsOf,
  timedSlotGroupsOf,
  groupPassNames,
  TIMED_SLOTS,
  TIMED_SLOT_GROUPS,
  BODY_SLAB_CAPACITY,
} from '../../../../src/services/engine/frame/frameProgram';
import { CONTENT_LAYERS } from '../../../../src/services/engine/frame/passes';
import { buildTimingSlotMap } from '../../../../src/services/gpu/timing/buildTimingSlotMap';
import { COSMO, NEAR0, deriveSlabs } from '../../../../src/services/engine/frame/slabs';
import type { ToneMap } from '../../../../src/@types/rendering/ToneMap';
import type { ContentLayer } from '../../../../src/@types/engine/frame/ContentLayer';
import type { FrameStep } from '../../../../src/@types/engine/frame/FrameStep';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';

const TONE: ToneMap = { exposure: 1.5, curve: 4, hdrKnee: 0, hdrHeadroom: 0 };

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

/**
 * A minimal `ContentLayer` fixture — only the fields `timedSlotsOf` reads
 * (`name`, `target`, `slab`) carry meaning; `enabled`/`draw` are typed
 * stubs so the row satisfies the contract without a renderer.
 */
function fakeLayer(name: string, target: string, slab: number): ContentLayer {
  return {
    name,
    slab,
    target,
    blend: 'additive',
    enabled: vi.fn<ContentLayer['enabled']>(() => true),
    draw: vi.fn<ContentLayer['draw']>(),
  };
}

describe('frameProgram', () => {
  it('emits today’s exact list when the chain is [NEAR0]', () => {
    // The P2 no-behaviour-change gate (spec §13): a one-entry chain — the
    // pre-Task-7 shape, before any body row could join it — must reproduce
    // exactly the program that shipped before this task, with ONE
    // difference: the foreground:0 render now carries `depthLoad: 'clear'`
    // (controller ruling R1) — semantically identical to the executor's
    // first-touch rule for this step's position (nothing else has touched
    // `foreground:0` yet), but now explicit because a multi-entry chain
    // needs every non-first entry to restart depth mid-frame.
    //
    // The two reduced-resolution AGGREGATE renders (survey stars into
    // `star-aggregates`, the Milky-Way cloud's star billboards into
    // `mw-aggregate`) both sit BEFORE the hdr NEAR0 step, so the `star-upsample`
    // and `milky-way-upsample` layers inside that step can composite them — the
    // twin of the volume render preceding volume-upsample.
    // The (hdr, NEAR0) step then sits after the cosmological hdr render, so the
    // stars accumulate into HDR and ride the same tone-map as the galaxies
    // (COSMO's 0.01 Mpc near plane would clip their parsec-scale anchors). The
    // foreground bodies render next and composite OVER hdr in LINEAR space
    // (tone: null), so their pixels join HDR before the lone hdr→swap tone-map.
    // The swap overlays draw last, after that single tone-map. The compute
    // prelude carries TWO steps — the flow integrate and the atmosphere
    // sky-view LUT bake — both ahead of the foreground render so the atmosphere
    // shell samples this frame's LUT.
    // Bloom OFF — the base thirteen-step shape (the bloom-enabled program splices
    // one bloom step between the foreground composite and the tone-map; see the
    // bloom-gating tests below).
    expect(frameProgram(TONE, false, [NEAR0], [])).toEqual([
      { kind: 'compute', name: 'flow' },
      { kind: 'compute', name: 'atmosphereSkyView' },
      { kind: 'render', target: 'volume', slab: COSMO },
      { kind: 'render', target: 'zoa', slab: COSMO },
      { kind: 'render', target: 'hdr', slab: COSMO },
      { kind: 'render', target: 'star-aggregates', slab: NEAR0 },
      { kind: 'render', target: 'mw-aggregate', slab: NEAR0 },
      { kind: 'render', target: 'hdr', slab: NEAR0 },
      { kind: 'render', target: 'foreground:0', slab: NEAR0, depthLoad: 'clear' },
      {
        kind: 'composite',
        step: { source: 'foreground:0', dest: 'hdr', blend: 'over', tone: null },
      },
      { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: TONE } },
      { kind: 'render', target: 'swap', slab: COSMO },
      { kind: 'render', target: 'swap', slab: NEAR0 },
    ]);
  });

  it('emits a COSMO capture step alongside NEAR0 per requested face (Task 13b)', () => {
    // The fixed opt-in roster spans both slabs — `point-sprites` (COSMO),
    // `star-catalog`/`star-aggregates` (NEAR0) — and a capture
    // step's `slab` still gates its group normally (only `target` selection
    // is bypassed for a capture step). A NEAR0-only capture step would leave
    // the COSMO half of the roster permanently unselected regardless of its
    // `skyCapture` flag, so each requested face must get ONE step per slab.
    const program = frameProgram(TONE, false, [NEAR0], [0, 2]);
    const captureSteps = program.filter(
      (step) => step.kind === 'render' && step.target === 'sky-cubemap',
    );
    expect(captureSteps).toEqual([
      { kind: 'render', target: 'sky-cubemap', slab: COSMO, face: 0 },
      { kind: 'render', target: 'sky-cubemap', slab: NEAR0, face: 0 },
      { kind: 'render', target: 'sky-cubemap', slab: COSMO, face: 2 },
      { kind: 'render', target: 'sky-cubemap', slab: NEAR0, face: 2 },
    ]);
    // Ahead of every other render step, so a same-frame lensing draw can
    // sample a cubemap this frame actually wrote.
    expect(program[0]).toEqual({ kind: 'compute', name: 'flow' });
    expect(program[1]).toEqual({ kind: 'compute', name: 'atmosphereSkyView' });
    expect(program[2]).toEqual(captureSteps[0]);
  });

  it('emits no capture steps when no faces are requested (Q6 zero-dispatch)', () => {
    const program = frameProgram(TONE, false, [NEAR0], []);
    expect(program.some((step) => step.kind === 'render' && step.target === 'sky-cubemap')).toBe(
      false,
    );
  });

  it('expands the foreground chain in painter order', () => {
    // Chain [NEAR0, 3, 2] (an out-of-numeric-order chain, as a painter-order
    // chain legitimately is — index order is assignment order, not draw
    // order): three consecutive foreground:0 render steps, slabs in that
    // exact sequence, each depthLoad: 'clear' so a nearer row's depth test
    // starts fresh rather than fighting a farther row's. The surrounding
    // steps — the preceding (hdr, NEAR0) render and the following
    // foreground:0→hdr composite — are unmoved.
    const program = frameProgram(TONE, false, [NEAR0, 3, 2], []);
    const hdrNear0Idx = program.findIndex(
      (step) => step.kind === 'render' && step.target === 'hdr' && step.slab === NEAR0,
    );
    const chainSteps = program.slice(hdrNear0Idx + 1, hdrNear0Idx + 4);
    expect(chainSteps).toEqual([
      { kind: 'render', target: 'foreground:0', slab: NEAR0, depthLoad: 'clear' },
      { kind: 'render', target: 'foreground:0', slab: 3, depthLoad: 'clear' },
      { kind: 'render', target: 'foreground:0', slab: 2, depthLoad: 'clear' },
    ]);
    expect(program[hdrNear0Idx + 4]).toEqual({
      kind: 'composite',
      step: { source: 'foreground:0', dest: 'hdr', blend: 'over', tone: null },
    });
  });

  it('emits no foreground chain step for an empty chain', () => {
    // No star sphere resolved and no bodies visible: the chain is empty, so
    // no foreground:0 render step is emitted at all — but the
    // foreground:0→hdr composite still follows immediately after the (hdr,
    // NEAR0) render. A frame with no bodies must still composite a CLEARED
    // target: `executeFrame`'s composite step skips on an untouched source,
    // so this is a no-op at runtime, but the step must still exist in the
    // program or a future chain-emitting frame's stale-touched bookkeeping
    // would be one step off.
    const program = frameProgram(TONE, false, [], []);
    const hdrNear0Idx = program.findIndex(
      (step) => step.kind === 'render' && step.target === 'hdr' && step.slab === NEAR0,
    );
    expect(program[hdrNear0Idx + 1]).toEqual({
      kind: 'composite',
      step: { source: 'foreground:0', dest: 'hdr', blend: 'over', tone: null },
    });
    expect(program.some((step) => step.kind === 'render' && step.target === 'foreground:0')).toBe(
      false,
    );
  });

  it('exactly one composite is tone-mapped', () => {
    // The frame now has a SINGLE tone-map. The foreground:0→hdr composite runs
    // in LINEAR space (tone: null) so the bodies join HDR before the curve; the
    // hdr→swap replace-composite carries the one real tone object (identity,
    // not just equal values). Exactly one composite therefore carries a
    // non-null tone — that lone tone-map is what gives the frame one curve.
    const program = frameProgram(TONE, false, [NEAR0], []);
    const composites = program.filter((step) => step.kind === 'composite');
    const [foregroundComposite, hdrComposite] = composites;
    if (foregroundComposite?.kind !== 'composite' || hdrComposite?.kind !== 'composite') {
      throw new Error('expected two composite steps');
    }
    expect(foregroundComposite.step).toMatchObject({ source: 'foreground:0', dest: 'hdr' });
    expect(foregroundComposite.step.tone).toBeNull();
    expect(hdrComposite.step).toMatchObject({ source: 'hdr', dest: 'swap' });
    expect(hdrComposite.step.tone).toBe(TONE);
    expect(
      composites.filter((step) => step.kind === 'composite' && step.step.tone !== null),
    ).toHaveLength(1);
  });

  it('foreground:0→hdr composite precedes hdr→swap composite', () => {
    // Ordering is load-bearing: the foreground bodies must merge into HDR
    // BEFORE the tone-map, otherwise they'd be double-tonemapped (or skip the
    // curve entirely). Assert the linear body composite's index is below the
    // tone-map's.
    const program = frameProgram(TONE, false, [NEAR0], []);
    const isComposite = (source: string, dest: string) => (step: FrameStep) =>
      step.kind === 'composite' && step.step.source === source && step.step.dest === dest;
    const foregroundIdx = program.findIndex(isComposite('foreground:0', 'hdr'));
    const toneMapIdx = program.findIndex(isComposite('hdr', 'swap'));
    expect(foregroundIdx).toBeGreaterThanOrEqual(0);
    expect(foregroundIdx).toBeLessThan(toneMapIdx);
  });

  it('every render step references only slabs present in deriveSlabs’ table (NEAR0, COSMO)', () => {
    // Bloom is now ONE `{ kind: 'bloom' }` step, not N render steps on a
    // dedicated slab, so every remaining render step projects through NEAR0 or
    // COSMO — the two rows deriveSlabs returns. A render step naming an index
    // outside that table would throw in `slabViewOf` the moment it runs.
    const slabs = deriveSlabs({
      cam: makeCam(),
      cosmoVp: new Float32Array(16) as unknown as Mat4,
      pivotRadiusMpc: null,
      pose: () => null,
      visibleBodies: [],
      viewportPx: [1920, 1080],
      starSphereRangeM: null,
    });
    for (const step of frameProgram(TONE, true, [NEAR0], [])) {
      if (step.kind === 'render') {
        expect([NEAR0, COSMO]).toContain(step.slab);
        expect(slabs[step.slab]).toBeDefined();
      }
    }
  });

  it('bloom enabled: exactly one bloom step, between the foreground merge and the tone-map', () => {
    // The bright prefilter samples the composited HDR scene, and the fold rides
    // the lone hdr→swap tone curve — so the single `{ kind: 'bloom' }` step must
    // sit after the linear foreground:0→hdr composite and before the hdr→swap
    // tone-map. Exactly one composite still carries a non-null tone.
    const program = frameProgram(TONE, true, [NEAR0], []);
    const bloomSteps = program.filter((step) => step.kind === 'bloom');
    expect(bloomSteps).toHaveLength(1);

    const foregroundIdx = program.findIndex(
      (step) =>
        step.kind === 'composite' &&
        step.step.source === 'foreground:0' &&
        step.step.dest === 'hdr',
    );
    const bloomIdx = program.findIndex((step) => step.kind === 'bloom');
    const toneMapIdx = program.findIndex(
      (step) =>
        step.kind === 'composite' && step.step.source === 'hdr' && step.step.dest === 'swap',
    );
    expect(foregroundIdx).toBeGreaterThanOrEqual(0);
    expect(bloomIdx).toBeGreaterThan(foregroundIdx);
    expect(bloomIdx).toBeLessThan(toneMapIdx);
    expect(
      program.filter((step) => step.kind === 'composite' && step.step.tone !== null),
    ).toHaveLength(1);
  });

  it('sgrAStarLensingBodySlabs: emits an (hdr, slab) step per entry, after (hdr, NEAR0) and before the foreground chain', () => {
    // Task 14: before this, no step ever matched
    // sgrAStarLensingLayer's (slab: 'body', target: 'hdr') row. One render
    // step per requested body-slab index, positioned so the lens's OVER blend
    // occludes the (hdr, NEAR0) roster already accumulated above it.
    const program = frameProgram(TONE, false, [NEAR0], [], [4]);
    const hdrNear0Idx = program.findIndex(
      (step) => step.kind === 'render' && step.target === 'hdr' && step.slab === NEAR0,
    );
    expect(program[hdrNear0Idx + 1]).toEqual({ kind: 'render', target: 'hdr', slab: 4 });
    const foregroundIdx = program.findIndex(
      (step) => step.kind === 'render' && step.target === 'foreground:0',
    );
    expect(hdrNear0Idx + 1).toBeLessThan(foregroundIdx);
  });

  it('sgrAStarLensingBodySlabs omitted or empty: no extra step, program identical to the base list (zero-cost outside the band)', () => {
    const base = frameProgram(TONE, false, [NEAR0], [], undefined);
    expect(base.some((step) => step.kind === 'render' && step.slab >= 2)).toBe(false);
    // Task 14b: the split discriminant must not leak outside the
    // band either — the (hdr, NEAR0) step stays the single untagged step it
    // always was, byte-identical to pre-Task-14b.
    expect(base.some((step) => step.kind === 'render' && 'lensPhase' in step)).toBe(false);
  });

  it('sgrAStarLensingBodySlabs active: orbit-trails/body-glints move to their own step AFTER the lens step (Task 14b)', () => {
    // The evidenced gap: orbit-trails and body-glints (the S-star
    // trails and the Sgr A* far-field glint among them) used to share the
    // pre-lens (hdr, NEAR0) roster step and so drew UNDER the lens's OVER
    // blend. `ContentLayer.hdrPostLensing` moves them into a step that runs
    // after the lens's own (hdr, BODY[k]) step instead — checked here
    // against the REAL registry, so a missing flag on either layer (they'd
    // stay in 'pre', ahead of the lens) fails this.
    const slots = timedSlotsOf(frameProgram(TONE, false, [NEAR0], [], [4]), CONTENT_LAYERS);
    const lensLayerIdx = slots.indexOf('sgr-a-star-lensing·BODY[2]');
    expect(lensLayerIdx).toBeGreaterThanOrEqual(0);
    expect(slots.indexOf('orbit-trails')).toBeGreaterThan(lensLayerIdx);
    expect(slots.indexOf('body-glints')).toBeGreaterThan(lensLayerIdx);
  });

  it('bloom disabled: no bloom step emitted and program otherwise identical', () => {
    // Only `enabled` shapes the step list. Bloom-off is the base program; bloom-on
    // is that base with exactly ONE `{ kind: 'bloom' }` step spliced in between the
    // foreground composite and the tone-map — nothing else changes.
    const off = frameProgram(TONE, false, [NEAR0], []);
    const on = frameProgram(TONE, true, [NEAR0], []);

    const bloomSteps = on.filter((step) => step.kind === 'bloom');
    expect(bloomSteps).toEqual([{ kind: 'bloom' }]);
    expect(off.some((step) => step.kind === 'bloom')).toBe(false);

    // Strip the bloom step out of the enabled program: what remains is
    // byte-identical to the disabled program.
    const onWithoutBloom = on.filter((step) => step.kind !== 'bloom');
    expect(onWithoutBloom).toEqual(off);
  });
});

describe('timedSlotsOf', () => {
  it('lists layer slots per render step, composite slots, then pick', () => {
    // Two hdr layers, two swap layers — same (target, slab) grouping the
    // real registry uses. The volume render step matches no fake layer, so
    // it contributes nothing (the real scalar-volume layer lands in task 7).
    const layers: readonly ContentLayer[] = [
      fakeLayer('point-sprites', 'hdr', COSMO),
      fakeLayer('milky-way', 'hdr', COSMO),
      fakeLayer('selection-ring', 'swap', COSMO),
      fakeLayer('labels', 'swap', COSMO),
    ];

    // The composite slots are emitted from the program's composite STEPS
    // independent of the layers fixture (a composite step always contributes
    // its '<source>→<dest>' slot): the foreground:0→hdr linear merge precedes
    // the hdr→swap tone-map. This synthetic fixture has no near-field rows (no
    // aggregate offscreens, no (hdr, NEAR0) star points, no foreground bodies,
    // no NEAR0 captions), so those RENDER slots correctly contribute no LAYER
    // rows — but each render STEP still emits its '<target>·<SLAB>' group-key
    // slot (the merged-pass timing slot), so the empty steps show up as their
    // group key alone and the matched steps show their layers then the group
    // total. The foreground:0 render now precedes both composites (bodies merge
    // into HDR before the tone-map), so its group-key slot sits above them. The
    // zoa render step matches no fake layer either, so it contributes only
    // its own group-key slot, right after volume·COSMO.
    expect(timedSlotsOf(frameProgram(TONE, false, [NEAR0], []), layers)).toEqual([
      'volume·COSMO',
      'zoa·COSMO',
      'point-sprites',
      'milky-way',
      'hdr·COSMO',
      'star-aggregates·NEAR0',
      'mw-aggregate·NEAR0',
      'hdr·NEAR0',
      'foreground:0·NEAR0',
      'foreground:0→hdr',
      'hdr→swap',
      'selection-ring',
      'labels',
      'swap·COSMO',
      'swap·NEAR0',
      'pick',
    ]);
  });

  it('yields unique names', () => {
    const layers: readonly ContentLayer[] = [
      fakeLayer('point-sprites', 'hdr', COSMO),
      fakeLayer('selection-ring', 'swap', COSMO),
    ];
    // Bloom ON adds the single `'bloom'` slot; every render step now has a
    // distinct `(target, slab)`, so no slot name collides.
    const slots = timedSlotsOf(frameProgram(TONE, true, [NEAR0], []), layers);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('derives the real registry slot list: scalar-volume, nine hdr, the two aggregate offscreens, the (hdr, NEAR0) group, foreground bodies, foreground:0→hdr, hdr→swap, five swap, near captions, pick', () => {
    // The real CONTENT_LAYERS registry against the real program — the exact
    // ordered slot list the timing service allocates from and the DebugPanel
    // iterates. scalar-volume leads (the volume render step), then
    // zone-of-avoidance (its own reduced-res 'zoa' step, the same shape as
    // scalar-volume), then the nine COSMO hdr layers in registry order —
    // zone-of-avoidance-upsample among them, beside volume-upsample, its
    // closest sibling — then the two aggregate offscreens,
    // each its OWN NEAR0 render step ahead of the hdr NEAR0 step:
    // star-aggregates, then milky-way-aggregate. The (hdr, NEAR0) step follows
    // with milky-way-upsample + milky-way + star-points + star-catalog +
    // star-upsample + constellations before the tone-map — milky-way-upsample
    // precedes milky-way so the dust extincts the cloud's own starlight, that
    // pair leads the group so the multiplicative dust never darkens the local
    // starfield, and star-upsample sits adjacent to the star-catalog leaf draw
    // it composites. orbit-trails + body-glints trail LAST in this group
    // (Task 14) — this fixture passes no sgrAStarLensingBodySlabs, so its
    // own (hdr, BODY[k]) step (which would otherwise sit between this group
    // and the foreground:0 step) is absent, zero-cost. The
    // foreground:0 body render now comes NEXT (before the composites) — one
    // render STEP per foregroundChain entry (Task 9-11: earth, cloud-shell,
    // planets, textured-bodies, rings, and atmosphere-shell all ride the
    // 'body' slab sentinel, a SEPARATE step from the still-NEAR0 rest, so the
    // fixture below passes a body row (index 2) ahead of NEAR0 in the
    // chain): all six together in the body step (registry order), then a
    // NEAR0 step carrying only star-spheres and field-star-sphere — so the
    // bodies merge into HDR before the tone-map. The foreground:0→hdr LINEAR composite
    // then precedes the hdr→swap tone-map (the frame's only tone-map), and
    // the five swap overlays + the (swap, NEAR0) captions
    // (near0-selection-ring, foreground-labels) draw AFTER it, with pick last.
    // Each render STEP trails its layers with its own '<target>·<SLAB>'
    // group-key slot (the merged-pass timing slot Joint 2 adds), so
    // 'volume·COSMO' follows scalar-volume, 'hdr·COSMO' follows the eight COSMO
    // hdr layers, and so on down to 'swap·NEAR0' after the near-field captions.
    expect(timedSlotsOf(frameProgram(TONE, true, [2, NEAR0], []), CONTENT_LAYERS)).toEqual([
      'scalar-volume',
      'volume·COSMO',
      'zone-of-avoidance',
      'zoa·COSMO',
      'point-sprites',
      'procedural-disks',
      'textured-disks',
      'filaments',
      'flow',
      'volume-upsample',
      'zone-of-avoidance-upsample',
      'horizon-shell',
      'structure-markers',
      'hdr·COSMO',
      'star-aggregates',
      'star-aggregates·NEAR0',
      'milky-way-aggregate',
      'mw-aggregate·NEAR0',
      'milky-way-upsample',
      'milky-way',
      'star-points',
      'star-catalog',
      'star-upsample',
      'constellations',
      'orbit-trails',
      'body-glints',
      's-star-lensed-images',
      'hdr·NEAR0',
      // The body-m step (Task 9-11): every 'body'-slab layer matches EVERY
      // body row, so earth, cloud-shell, planets, textured-bodies, rings, and
      // atmosphere-shell all land here, in registry order — star-spheres and
      // field-star-sphere are the only foreground layers still literal NEAR0,
      // so they sit alone in the NEXT (NEAR0) step instead. Each name carries
      // its row (`·BODY[0]`, this fixture's one body slab) — `layerTimingSlotName`
      // (M2 fix): a second body row would give these a DIFFERENT suffix rather
      // than colliding on the same query-set slot.
      'earth·BODY[0]',
      'cloud-shell·BODY[0]',
      'planets·BODY[0]',
      'textured-bodies·BODY[0]',
      'rings·BODY[0]',
      'atmosphere-shell·BODY[0]',
      'foreground:0·BODY[0]',
      'star-spheres',
      'field-star-sphere',
      'foreground:0·NEAR0',
      'foreground:0→hdr',
      // The bloom sub-pipeline, spliced between the linear foreground merge and
      // the tone-map, bills ONE `'bloom'` slot spanning its whole pass sequence
      // (runBloom opens the ten passes itself — the executor sees a single step).
      'bloom',
      'hdr→swap',
      'selection-ring',
      'disk-radius-ring',
      'marker-lines',
      'labels',
      'swap·COSMO',
      'near0-selection-ring',
      'foreground-labels',
      'clip-path-debug',
      'swap·NEAR0',
      'pick',
    ]);
  });

  it('reaches sgrAStarLensingLayer once a body slab is passed (Task 14 regression: Task 13 found no step ever matched it)', () => {
    // Before Task 14, frameProgram never emitted an (hdr, BODY[k]) step, so
    // this name never appeared in ANY derived slot list regardless of the
    // real CONTENT_LAYERS registry or chain contents — the layer compiled
    // and registered but was structurally unreachable. Passing Sgr A*'s own
    // slab index (4, arbitrary — any body-slab index widens the same way)
    // must now surface its row, positioned right after the (hdr, NEAR0)
    // group's own slot.
    const slots = timedSlotsOf(frameProgram(TONE, false, [NEAR0], [], [4]), CONTENT_LAYERS);
    const hdrNear0Idx = slots.indexOf('hdr·NEAR0');
    expect(hdrNear0Idx).toBeGreaterThanOrEqual(0);
    expect(slots[hdrNear0Idx + 1]).toBe('sgr-a-star-lensing·BODY[2]');
    expect(slots[hdrNear0Idx + 2]).toBe('hdr·BODY[2]');
  });
});

describe('TIMED_SLOTS — body slot pool', () => {
  it('allocates one body slot per registry row', () => {
    // TIMED_SLOTS is built from the MAXIMUM chain (frameProgram.ts), so the
    // pool holds exactly BODY_SLAB_CAPACITY body slots regardless of what any
    // one frame's chain actually contains — the query-set size is a registry
    // fact, not a per-frame one. Asserting the endpoints + count (not the full
    // literal run) means a new SCENE_PLANETS row moves the count without
    // rewriting this test — a full-literal restatement would break on every
    // new planet (the ban `testing.md` names for this exact shape).
    const bodySlots = TIMED_SLOTS.filter((name) => name.startsWith('foreground:0·BODY['));
    expect(bodySlots).toHaveLength(BODY_SLAB_CAPACITY);
    expect(bodySlots[0]).toBe('foreground:0·BODY[0]');
    expect(bodySlots[bodySlots.length - 1]).toBe(`foreground:0·BODY[${BODY_SLAB_CAPACITY - 1}]`);
    expect(TIMED_SLOTS).not.toContain(`foreground:0·BODY[${BODY_SLAB_CAPACITY}]`);
  });

  it('puts every body slot under the Foreground bodies group', () => {
    const group = TIMED_SLOT_GROUPS.find((g) => g.title === 'Foreground bodies · depth')!;
    const names = group.rows.map((r) => r.name);
    expect(names).toContain('foreground:0·NEAR0');
    expect(names).toContain('foreground:0·BODY[0]');
    expect(names).toContain(`foreground:0·BODY[${BODY_SLAB_CAPACITY - 1}]`);
  });

  it('also allocates one hdr·BODY[k] slot per registry row (Task 14 — the lens pass pool)', () => {
    // Same "maximum, not a real frame" sizing as the foreground:0 pool above,
    // for the black-hole lens's own (hdr, BODY[k]) step: Sgr A*'s
    // painter-order row varies with which other bodies are visible, so
    // TIMED_SLOTS must cover every capacity slot it could land on.
    const bodySlots = TIMED_SLOTS.filter((name) => name.startsWith('hdr·BODY['));
    expect(bodySlots).toHaveLength(BODY_SLAB_CAPACITY);
    expect(bodySlots[0]).toBe('hdr·BODY[0]');
    expect(bodySlots[bodySlots.length - 1]).toBe(`hdr·BODY[${BODY_SLAB_CAPACITY - 1}]`);
    const group = TIMED_SLOT_GROUPS.find((g) => g.title === 'Sgr A* lensing')!;
    expect(group.rows.map((r) => r.name)).toContain('hdr·BODY[0]');
  });

  it('every real TIMED_SLOTS name is unique (buildTimingSlotMap precondition, M2)', () => {
    // The regression: a 'body' layer used to contribute its bare name once per
    // capacity row (~26 identical 'planets' entries), which collided on one
    // query-set index pair. `buildTimingSlotMap` now throws on a duplicate —
    // this pins that the real registry actually satisfies the precondition,
    // not just a fixture.
    expect(new Set(TIMED_SLOTS).size).toBe(TIMED_SLOTS.length);
    expect(() => buildTimingSlotMap(TIMED_SLOTS)).not.toThrow();
  });
});

describe('timedSlotGroupsOf', () => {
  it('buckets each render step’s layers under its (target, slab) group title, in the six-group order', () => {
    // Fake layers matched against the REAL program: two hdr·COSMO layers, one
    // swap·COSMO overlay, one foreground:0·NEAR0 body. Every render step now
    // ALSO emits its '<target>·<SLAB>' group-key row (the merged-pass timing
    // slot), so even the steps matching no fake layer — volume·COSMO,
    // star-aggregates·NEAR0, mw-aggregate·NEAR0, hdr·NEAR0, swap·NEAR0 —
    // contribute their group key and their titles appear. All six groups
    // therefore show, and each row's group key buckets it under its step's
    // title.
    const layers: readonly ContentLayer[] = [
      fakeLayer('point-sprites', 'hdr', COSMO),
      fakeLayer('milky-way', 'hdr', COSMO),
      fakeLayer('labels', 'swap', COSMO),
      fakeLayer('earth', 'foreground:0', NEAR0),
    ];
    const groups = timedSlotGroupsOf(frameProgram(TONE, false, [NEAR0], []), layers);

    // Group titles in draw/table order. The two composites and pick collapse
    // into one trailing group.
    expect(groups.map((g) => g.title)).toEqual([
      'Volumes & aggregates',
      'Cosmos · HDR',
      'Near field · HDR',
      'Foreground bodies · depth',
      'Overlays',
      'Composites & pick',
    ]);

    // Rows keep draw order within their group: each matched layer, then its
    // step's group-key row; the two swap steps merge under Overlays. The
    // trailing infra group carries both composites (foreground:0→hdr linear
    // merge, then hdr→swap tone-map) and pick. The zoa render step matches
    // no fake layer, so it contributes only its group-key row, between
    // volume·COSMO and star-aggregates·NEAR0.
    expect(groups.map((g) => g.rows.map((r) => r.name))).toEqual([
      ['volume·COSMO', 'zoa·COSMO', 'star-aggregates·NEAR0', 'mw-aggregate·NEAR0'],
      ['point-sprites', 'milky-way', 'hdr·COSMO'],
      ['hdr·NEAR0'],
      ['earth', 'foreground:0·NEAR0'],
      ['labels', 'swap·COSMO', 'swap·NEAR0'],
      ['foreground:0→hdr', 'hdr→swap', 'pick'],
    ]);
    // The 'Cosmos · HDR' group's first row (point-sprites) carries the step's
    // group key; the trailing infra group carries composite/composite/pick.
    expect(groups[1]!.rows[0]!.groupKey).toBe('hdr·COSMO');
    expect(groups[5]!.rows.map((r) => r.groupKey)).toEqual(['composite', 'composite', 'pick']);
  });

  it('merges scalar-volume + zone-of-avoidance + the two aggregate offscreens into one group and sinks composites+pick to the last group', () => {
    // The real registry against the real program — the value the DebugPanel
    // consumes. scalar-volume (volume·COSMO), zone-of-avoidance (zoa·COSMO),
    // star-aggregates (star-aggregates·NEAR0) and
    // milky-way-aggregate (mw-aggregate·NEAR0) are non-adjacent steps that all
    // map to "Volumes & aggregates"; the two composites and pick — scattered
    // through execution order — collapse into
    // the trailing "Composites & pick". "Sky capture" is TIMED_SLOTS' 6 capture
    // steps (Task 12's ALL_CUBE_FACES sizing, one row per face). "Sgr A*
    // lensing" is Task 14's own (hdr, BODY[k]) pool, sized off
    // MAX_SGR_A_STAR_LENSING_BODY_SLABS the same way "Foreground bodies"
    // is sized off MAX_FOREGROUND_CHAIN.
    expect(TIMED_SLOT_GROUPS.map((g) => g.title)).toEqual([
      'Volumes & aggregates',
      'Sky capture',
      'Cosmos · HDR',
      'Near field · HDR',
      'Sgr A* lensing',
      'Foreground bodies · depth',
      'Bloom',
      'Overlays',
      'Composites & pick',
    ]);

    const byTitle = (title: string) => TIMED_SLOT_GROUPS.find((g) => g.title === title)!;
    // The bloom sub-pipeline buckets under one 'Bloom' group, between Foreground
    // and Overlays, carrying the single `'bloom'` slot (runBloom owns the ten
    // passes; the frame sees one step, so one timing row).
    expect(byTitle('Bloom').rows.map((r) => r.name)).toEqual(['bloom']);
    // Each render step trails its layers with its '<target>·<SLAB>' group-key
    // row, so volume·COSMO follows scalar-volume, zoa·COSMO follows
    // zone-of-avoidance (its own reduced-res step), star-aggregates·NEAR0
    // follows star-aggregates, and mw-aggregate·NEAR0 follows milky-way-aggregate
    // within this merged group.
    expect(byTitle('Volumes & aggregates').rows.map((r) => r.name)).toEqual([
      'scalar-volume',
      'volume·COSMO',
      'zone-of-avoidance',
      'zoa·COSMO',
      'star-aggregates',
      'star-aggregates·NEAR0',
      'milky-way-aggregate',
      'mw-aggregate·NEAR0',
    ]);
    // Overlays merges the COSMO swap overlays with the NEAR0 near-field swap
    // rows (two non-adjacent swap steps), each trailed by its group-key row.
    expect(byTitle('Overlays').rows.map((r) => r.name)).toEqual([
      'selection-ring',
      'disk-radius-ring',
      'marker-lines',
      'labels',
      'swap·COSMO',
      'near0-selection-ring',
      'foreground-labels',
      'clip-path-debug',
      'swap·NEAR0',
    ]);
    // Composites and pick emit no group-key rows (only render steps do). The
    // foreground:0→hdr linear merge now precedes the hdr→swap tone-map, then
    // pick.
    expect(byTitle('Composites & pick').rows.map((r) => r.name)).toEqual([
      'foreground:0→hdr',
      'hdr→swap',
      'pick',
    ]);
  });

  it('gives a body-family layer a distinct row per body index, keyed by its slab (M2 fix)', () => {
    // A `slab: 'body'` layer (e.g. `planetsLayer`) matches EVERY body-row
    // step in the chain — with two body rows it must contribute TWO
    // distinctly-NAMED 'planets·BODY[k]' rows, not one collapsed 'planets'
    // row: the underlying GPU timing indexes solely by name
    // (`buildTimingSlotMap`), so two same-named passes in one encoder would
    // both write the SAME two query indices and the reported figure would be
    // whichever pass resolved last — under-reporting a multi-body scene by a
    // factor of N. See `layerTimingSlotName` (slabs.ts).
    const bodyLayer: ContentLayer = {
      name: 'planets',
      slab: 'body',
      target: 'foreground:0',
      blend: 'over',
      enabled: vi.fn<ContentLayer['enabled']>(() => true),
      draw: vi.fn<ContentLayer['draw']>(),
    };
    const groups = timedSlotGroupsOf(frameProgram(TONE, false, [NEAR0, 2, 3], []), [bodyLayer]);
    const foreground = groups.find((g) => g.title === 'Foreground bodies · depth')!;
    expect(foreground.rows.map((r) => r.name)).toEqual([
      'foreground:0·NEAR0',
      'planets·BODY[0]',
      'foreground:0·BODY[0]',
      'planets·BODY[1]',
      'foreground:0·BODY[1]',
    ]);
  });

  it('falls back to the raw groupKey as the title for an unmapped (target, slab) step', () => {
    // A genuinely new render target/slab the title table doesn't know: the
    // group still forms (self-maintaining), titled with the raw key rather
    // than vanishing. Known titles hold their fixed positions; the unmapped
    // fallback group appends after them (a nudge to give it a real title).
    const program: readonly FrameStep[] = [{ kind: 'render', target: 'foo', slab: COSMO }];
    const groups = timedSlotGroupsOf(program, [fakeLayer('x', 'foo', COSMO)]);
    expect(groups.map((g) => g.title)).toEqual(['Composites & pick', 'foo·COSMO']);
    const fallback = groups.find((g) => g.title === 'foo·COSMO')!;
    // The layer row, then the step's own group-key row (name === groupKey).
    expect(fallback.rows).toEqual([
      { name: 'x', groupKey: 'foo·COSMO' },
      { name: 'foo·COSMO', groupKey: 'foo·COSMO' },
    ]);
  });
});

describe('groupPassNames', () => {
  it('groups an arbitrary togglable-name list by pass group, in title order, omitting empty groups', () => {
    // 'earth' is a real `slab: 'body'` layer: the engine handle's `allNames`
    // passes its PLAIN name (one entry regardless of body-row count), which
    // must still resolve to 'Foreground bodies · depth' even though
    // `layerTimingSlotName` suffixes its TIMED_SLOTS row — `PASS_GROUP_KEYS`
    // is built from the separate `plainLayerGroupKeys` walk for exactly this.
    const groups = groupPassNames(['labels', 'point-sprites', 'earth', 'star-aggregates']);
    expect(groups.map((g) => g.title)).toEqual([
      'Volumes & aggregates', // star-aggregates
      'Cosmos · HDR', // point-sprites
      'Foreground bodies · depth', // earth
      'Overlays', // labels
    ]);
    // No composite/pick names supplied (they aren't togglable), so that group
    // never appears in the toggles projection.
    expect(groups.some((g) => g.title === 'Composites & pick')).toBe(false);
  });

  it('puts an unknown pass name in a fallback group titled with the name itself', () => {
    expect(groupPassNames(['textured-quads'])).toEqual([
      { title: 'textured-quads', rows: [{ name: 'textured-quads', groupKey: 'textured-quads' }] },
    ]);
  });
});
