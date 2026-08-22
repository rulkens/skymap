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
  TIMED_SLOT_GROUPS,
} from '../../../../src/services/engine/frame/frameProgram';
import { CONTENT_LAYERS } from '../../../../src/services/engine/frame/passes';
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
  it('emits the thirteen-step main program', () => {
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
    expect(frameProgram(TONE, false)).toEqual([
      { kind: 'compute', name: 'flow' },
      { kind: 'compute', name: 'atmosphereSkyView' },
      { kind: 'render', target: 'volume', slab: COSMO },
      { kind: 'render', target: 'zoa', slab: COSMO },
      { kind: 'render', target: 'hdr', slab: COSMO },
      { kind: 'render', target: 'star-aggregates', slab: NEAR0 },
      { kind: 'render', target: 'mw-aggregate', slab: NEAR0 },
      { kind: 'render', target: 'hdr', slab: NEAR0 },
      { kind: 'render', target: 'foreground:0', slab: NEAR0 },
      {
        kind: 'composite',
        step: { source: 'foreground:0', dest: 'hdr', blend: 'over', tone: null },
      },
      { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: TONE } },
      { kind: 'render', target: 'swap', slab: COSMO },
      { kind: 'render', target: 'swap', slab: NEAR0 },
    ]);
  });

  it('exactly one composite is tone-mapped', () => {
    // The frame now has a SINGLE tone-map. The foreground:0→hdr composite runs
    // in LINEAR space (tone: null) so the bodies join HDR before the curve; the
    // hdr→swap replace-composite carries the one real tone object (identity,
    // not just equal values). Exactly one composite therefore carries a
    // non-null tone — that lone tone-map is what gives the frame one curve.
    const program = frameProgram(TONE, false);
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
    const program = frameProgram(TONE, false);
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
    const slabs = deriveSlabs(makeCam(), new Float32Array(16) as unknown as Mat4);
    for (const step of frameProgram(TONE, true)) {
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
    const program = frameProgram(TONE, true);
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

  it('bloom disabled: no bloom step emitted and program otherwise identical', () => {
    // Only `enabled` shapes the step list. Bloom-off is the base program; bloom-on
    // is that base with exactly ONE `{ kind: 'bloom' }` step spliced in between the
    // foreground composite and the tone-map — nothing else changes.
    const off = frameProgram(TONE, false);
    const on = frameProgram(TONE, true);

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
    expect(timedSlotsOf(frameProgram(TONE, false), layers)).toEqual([
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
    const slots = timedSlotsOf(frameProgram(TONE, true), layers);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('derives the real registry slot list: scalar-volume, ten hdr, the two aggregate offscreens, the (hdr, NEAR0) group, foreground bodies, foreground:0→hdr, hdr→swap, five swap, near captions, pick', () => {
    // The real CONTENT_LAYERS registry against the real program — the exact
    // ordered slot list the timing service allocates from and the DebugPanel
    // iterates. scalar-volume leads (the volume render step), then
    // zone-of-avoidance (its own reduced-res 'zoa' step, the same shape as
    // scalar-volume), then the ten COSMO hdr layers in registry order —
    // zone-of-avoidance-upsample among them, beside volume-upsample, its
    // closest sibling, followed immediately by labels3d (the shared Label3D
    // draw site, its former host) — then the two aggregate offscreens,
    // each its OWN NEAR0 render step ahead of the hdr NEAR0 step:
    // star-aggregates, then milky-way-aggregate. The (hdr, NEAR0) step follows
    // with milky-way-upsample + milky-way + star-points + orbit-trails +
    // star-catalog + star-upsample + constellations + labels3d-near0 (the
    // THROWAWAY vrSpike's planet-scale VR captions) before the tone-map —
    // milky-way-upsample precedes milky-way so the dust extincts the cloud's
    // own starlight, that pair leads the group so the multiplicative dust
    // never darkens the local starfield, and star-upsample sits adjacent to
    // the star-catalog leaf draw it composites. The
    // foreground:0 body render now comes NEXT (before the composites) — one
    // slot per body layer: earth, then Earth's translucent cloud-shell overlay
    // (drawn right after the opaque surface), star-spheres, field-star-sphere,
    // planets, textured-bodies, then the translucent rings overlay, then
    // atmosphere-shell — so the bodies merge into HDR before the tone-map. The
    // foreground:0→hdr LINEAR composite then precedes the hdr→swap tone-map (the
    // frame's only tone-map), and the five swap overlays + the (swap, NEAR0)
    // captions (near0-selection-ring, foreground-labels) draw AFTER it, with
    // pick last.
    // Each render STEP trails its layers with its own '<target>·<SLAB>'
    // group-key slot (the merged-pass timing slot Joint 2 adds), so
    // 'volume·COSMO' follows scalar-volume, 'hdr·COSMO' follows the ten COSMO
    // hdr layers, and so on down to 'swap·NEAR0' after the near-field captions.
    expect(timedSlotsOf(frameProgram(TONE, true), CONTENT_LAYERS)).toEqual([
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
      'labels3d',
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
      'orbit-trails',
      'body-glints',
      'star-catalog',
      'star-upsample',
      'constellations',
      'labels3d-near0',
      'hdr·NEAR0',
      'earth',
      'cloud-shell',
      'star-spheres',
      'field-star-sphere',
      'planets',
      'textured-bodies',
      'rings',
      // Earth's in-scatter atmosphere: the LAST foreground:0 layer in registry
      // order, so its slot trails the ring's inside the foreground:0 render step
      // (before that step's foreground:0·NEAR0 group slot and the two
      // composites).
      'atmosphere-shell',
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
    const groups = timedSlotGroupsOf(frameProgram(TONE, false), layers);

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
    // the trailing "Composites & pick".
    expect(TIMED_SLOT_GROUPS.map((g) => g.title)).toEqual([
      'Volumes & aggregates',
      'Cosmos · HDR',
      'Near field · HDR',
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
