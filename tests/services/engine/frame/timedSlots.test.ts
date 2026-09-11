/**
 * timedSlots — the GPU-timing slot derivations over `FRAME_ORDER`'s
 * expansion, plus the expansion rules the four cases in
 * `expandFrameOrder.test.ts` don't reach (the capture/foreground/lens fan-outs
 * and the bloom gate).
 *
 * Slot names are a wire format: `createGpuTimingService` allocates a query pair
 * per name and the DebugPanel + perf harness look them up byte-for-byte, so the
 * real-registry list below is asserted in full rather than sampled.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import {
  timedSlotsOf,
  timedSlotGroupsOf,
  groupPassNames,
  TIMED_SLOTS,
  TIMED_SLOT_GROUPS,
  BODY_SLAB_CAPACITY,
} from '../../../../src/services/engine/frame/timedSlots';
import { expandFrameOrder } from '../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { buildTimingSlotMap } from '../../../../src/services/gpu/timing/buildTimingSlotMap';
import { COSMO, NEAR0, deriveSlabs } from '../../../../src/services/engine/frame/slabs';
import type { FrameInputs } from '../../../../src/services/engine/frame/expandFrameOrder';
import type { ToneMap } from '../../../../src/@types/rendering/ToneMap';
import type { ContentPass } from '../../../../src/@types/engine/frame/ContentPass';
import type { FrameStep } from '../../../../src/@types/engine/frame/FrameStep';
import type { FrameStepSpec } from '../../../../src/@types/engine/frame/FrameStepSpec';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';

const TONE: ToneMap = { exposure: 1.5, curve: 4, hdrKnee: 0, hdrHeadroom: 0 };

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

/** A minimal `ContentPass` fixture — the derivations read only `name`. */
function fakePass(name: string): ContentPass {
  return {
    name,
    blend: 'additive',
    enabled: vi.fn<ContentPass['enabled']>(() => true),
    draw: vi.fn<ContentPass['draw']>(),
  };
}

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

describe('timedSlotsOf', () => {
  it('derives the real registry slot list: scalar-volume, nine hdr, the two aggregate offscreens, the (hdr, NEAR0) group, foreground bodies, foreground:0→hdr, hdr→swap, five swap, near captions, pick', () => {
    // The real registry against the real order — the exact ordered slot list the
    // timing service allocates from and the DebugPanel iterates. Each render
    // STEP trails its passes with its own `<target>·<SLAB>` group-key slot (the
    // merged-pass timing slot), so `volume·COSMO` follows scalar-volume,
    // `hdr·COSMO` follows the nine COSMO hdr rows, and so on.
    //
    // This fixture passes no lensing row, so the `lens` line emits nothing and
    // the POST_LENSING line merges back into the roster above it — which is why
    // `body-glints` trails the roster under the bare `hdr·NEAR0` key rather than
    // billing its own. The chain leads with a body row (index 2) so the six
    // body-drawn foreground passes get a step of their own, ahead of the
    // still-NEAR0 star spheres.
    expect(timedSlotsOf(program({ bloomEnabled: true, foregroundChain: [2, NEAR0] }))).toEqual([
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
      'body-glints',
      'hdr·NEAR0',
      // Every 'body'-drawn foreground pass lands on the body row, in the
      // authored order; each name carries its row (`·BODY[0]`) —
      // `passTimingSlotName` — so a second body row gets a DIFFERENT suffix
      // rather than colliding on the same query-set slot.
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
      // orbit-trails alone in the post-foreground slice: over the opaque bodies,
      // still ahead of bloom and the tone-map.
      'orbit-trails',
      'hdr·NEAR0·POST_FOREGROUND',
      // The bloom sub-pipeline bills ONE slot spanning its whole pass sequence
      // (runBloom opens the ten passes itself — the frame sees a single step).
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

  it('reaches sgrAStarLensingPass once a body slab is passed', () => {
    // Until the lens got its own `FRAME_ORDER` line, no step ever matched
    // `sgrAStarLensingPass` — the pass compiled and registered but was
    // structurally unreachable. Passing a body-slab index (4, arbitrary) must
    // surface its row right after the (hdr, NEAR0) group's own slot.
    const slots = timedSlotsOf(program({ lensBodySlabs: [4] }));
    const rosterIdx = slots.indexOf('hdr·NEAR0');
    expect(rosterIdx).toBeGreaterThanOrEqual(0);
    expect(slots[rosterIdx + 1]).toBe('sgr-a-star-lensing·BODY[2]');
    expect(slots[rosterIdx + 2]).toBe('hdr·BODY[2]');
  });

  it('bills orbit-trails and body-glints AFTER the lens step', () => {
    // The evidenced gap: both used to share the pre-lens roster step and so drew
    // UNDER the lens's OVER blend. They now have their own `FRAME_ORDER` lines
    // past the lens — checked against the REAL registry, so moving either back
    // into the roster line fails this.
    const slots = timedSlotsOf(program({ lensBodySlabs: [4] }));
    const lensIdx = slots.indexOf('sgr-a-star-lensing·BODY[2]');
    expect(lensIdx).toBeGreaterThanOrEqual(0);
    expect(slots.indexOf('orbit-trails')).toBeGreaterThan(lensIdx);
    expect(slots.indexOf('body-glints')).toBeGreaterThan(lensIdx);
  });

  it('bills orbit-trails AFTER the foreground:0→hdr body composite and before the tone-map', () => {
    // A satellite trail's near arc passes in front of its host; drawn before the
    // opaque body composite it would be covered along with the far arc.
    const slots = timedSlotsOf(program());
    const compositeIdx = slots.indexOf('foreground:0→hdr');
    expect(compositeIdx).toBeGreaterThanOrEqual(0);
    expect(slots.indexOf('orbit-trails')).toBeGreaterThan(compositeIdx);
    expect(slots.indexOf('orbit-trails')).toBeLessThan(slots.indexOf('hdr→swap'));
  });
});

describe('TIMED_SLOTS — body slot pool', () => {
  it('allocates one body slot per registry row', () => {
    // TIMED_SLOTS expands the MAXIMUM chain, so the pool holds exactly
    // BODY_SLAB_CAPACITY body slots regardless of what any one frame's chain
    // contains — the query-set size is a registry fact, not a per-frame one.
    // Asserting the endpoints + count (not the full literal run) means a new
    // SCENE_PLANETS row moves the count without rewriting this test.
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

  it('also allocates one hdr·BODY[k] slot per registry row (the lens pass pool)', () => {
    // Same "maximum, not a real frame" sizing as the foreground:0 pool above:
    // Sgr A*'s painter-order row varies with which other bodies are visible, so
    // TIMED_SLOTS must cover every capacity slot it could land on.
    const bodySlots = TIMED_SLOTS.filter((name) => name.startsWith('hdr·BODY['));
    expect(bodySlots).toHaveLength(BODY_SLAB_CAPACITY);
    expect(bodySlots[0]).toBe('hdr·BODY[0]');
    expect(bodySlots[bodySlots.length - 1]).toBe(`hdr·BODY[${BODY_SLAB_CAPACITY - 1}]`);
    const group = TIMED_SLOT_GROUPS.find((g) => g.title === 'Sgr A* lensing')!;
    expect(group.rows.map((r) => r.name)).toContain('hdr·BODY[0]');
  });

  it('every real TIMED_SLOTS name is unique (buildTimingSlotMap precondition, M2)', () => {
    // The regression: a 'body' pass used to contribute its bare name once per
    // capacity row (~26 identical 'planets' entries), which collided on one
    // query-set index pair. `buildTimingSlotMap` now throws on a duplicate —
    // this pins that the real registry satisfies the precondition, not a fixture.
    expect(new Set(TIMED_SLOTS).size).toBe(TIMED_SLOTS.length);
    expect(() => buildTimingSlotMap(TIMED_SLOTS)).not.toThrow();
  });
});

describe('timedSlotGroupsOf', () => {
  it('merges scalar-volume + zone-of-avoidance + the two aggregate offscreens into one group and sinks composites+pick to the last group', () => {
    // The real registry against the real order — the value the DebugPanel
    // consumes. scalar-volume (volume·COSMO), zone-of-avoidance (zoa·COSMO),
    // star-aggregates and milky-way-aggregate are non-adjacent steps that all
    // map to "Volumes & aggregates"; the two composites and pick — scattered
    // through execution order — collapse into the trailing "Composites & pick".
    // "Sky capture" is TIMED_SLOTS' 6 capture steps (one row per face); "Sgr A*
    // lensing" is the lens pool, sized off MAX_SGR_A_STAR_LENSING_BODY_SLABS the
    // same way "Foreground bodies" is sized off MAX_FOREGROUND_CHAIN.
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
    // and Overlays, carrying the single `'bloom'` slot.
    expect(byTitle('Bloom').rows.map((r) => r.name)).toEqual(['bloom']);
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
    // Composites and pick emit no group-key rows (only render steps do).
    expect(byTitle('Composites & pick').rows.map((r) => r.name)).toEqual([
      'foreground:0→hdr',
      'hdr→swap',
      'pick',
    ]);
  });

  it('gives a body-family pass a distinct row per body index, keyed by its slab (M2 fix)', () => {
    // A pass drawn on every body row must contribute TWO distinctly-NAMED
    // 'planets·BODY[k]' rows, not one collapsed 'planets' row: the underlying
    // GPU timing indexes solely by name (`buildTimingSlotMap`), so two
    // same-named passes in one encoder would both write the SAME two query
    // indices and the reported figure would be whichever resolved last —
    // under-reporting a multi-body scene by a factor of N.
    const order: readonly FrameStepSpec[] = [
      {
        kind: 'foreground',
        target: 'foreground:0',
        near0Passes: [],
        bodyPasses: ['planets'],
      },
    ];
    const groups = timedSlotGroupsOf(
      expandFrameOrder(order, [fakePass('planets')], {
        tone: TONE,
        bloomEnabled: false,
        foregroundChain: [NEAR0, 2, 3],
        skyCubemapFacesToCapture: [],
        lensBodySlabs: [],
      }),
    );
    const foreground = groups.find((g) => g.title === 'Foreground bodies · depth')!;
    // The NEAR0 chain entry resolves an empty roster and so emits no step at all.
    expect(foreground.rows.map((r) => r.name)).toEqual([
      'planets·BODY[0]',
      'foreground:0·BODY[0]',
      'planets·BODY[1]',
      'foreground:0·BODY[1]',
    ]);
  });

  it('falls back to the raw groupKey as the title for an unmapped (target, slab) step', () => {
    // A genuinely new render target/slab the title table doesn't know: the group
    // still forms (self-maintaining), titled with the raw key rather than
    // vanishing. Known titles hold their fixed positions; the unmapped fallback
    // appends after them (a nudge to give it a real title).
    const steps: readonly FrameStep[] = [
      { kind: 'render', target: 'foo', slab: COSMO, passes: [fakePass('x')] },
    ];
    const groups = timedSlotGroupsOf(steps);
    expect(groups.map((g) => g.title)).toEqual(['Composites & pick', 'foo·COSMO']);
    const fallback = groups.find((g) => g.title === 'foo·COSMO')!;
    // The pass row, then the step's own group-key row (name === groupKey).
    expect(fallback.rows).toEqual([
      { name: 'x', groupKey: 'foo·COSMO' },
      { name: 'foo·COSMO', groupKey: 'foo·COSMO' },
    ]);
  });
});

describe('groupPassNames', () => {
  it('groups an arbitrary togglable-name list by pass group, in title order, omitting empty groups', () => {
    // 'earth' is drawn only on body rows: the engine handle's `allNames` passes
    // its PLAIN name (one entry regardless of body-row count), which must still
    // resolve to 'Foreground bodies · depth' even though `passTimingSlotName`
    // suffixes its TIMED_SLOTS row — `PASS_GROUP_KEYS` is built from the
    // separate `plainPassGroupKeys` walk for exactly this.
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
