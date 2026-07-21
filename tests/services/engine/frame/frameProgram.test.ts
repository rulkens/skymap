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

const TONE: ToneMap = { exposure: 1.5, curve: 4 };

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
  it('emits the eleven-step main program', () => {
    // The survey-star AGGREGATE render (into its own half-res offscreen) sits
    // BEFORE the hdr NEAR0 step, so the `star-upsample` layer inside that step
    // can composite it — the twin of the volume render preceding volume-upsample.
    // The (hdr, NEAR0) step then sits after the cosmological hdr render and
    // BEFORE the hdr→swap composite, so the stars accumulate into HDR and ride
    // the same tone-map as the galaxies (COSMO's 0.01 Mpc near plane would clip
    // their parsec-scale anchors). The compute prelude carries TWO steps — the
    // flow integrate and the atmosphere sky-view LUT bake — both ahead of the
    // foreground render so the atmosphere shell samples this frame's LUT.
    expect(frameProgram(TONE)).toEqual([
      { kind: 'compute', name: 'flow' },
      { kind: 'compute', name: 'atmosphereSkyView' },
      { kind: 'render', target: 'volume', slab: COSMO },
      { kind: 'render', target: 'hdr', slab: COSMO },
      { kind: 'render', target: 'star-aggregates', slab: NEAR0 },
      { kind: 'render', target: 'hdr', slab: NEAR0 },
      { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: TONE } },
      { kind: 'render', target: 'swap', slab: COSMO },
      { kind: 'render', target: 'foreground:0', slab: NEAR0 },
      {
        kind: 'composite',
        step: { source: 'foreground:0', dest: 'swap', blend: 'over', tone: TONE },
      },
      { kind: 'render', target: 'swap', slab: NEAR0 },
    ]);
  });

  it('the two composites share one tone instance', () => {
    // The hdr→swap tone-map and the foreground:0→swap OVER must carry the
    // SAME tone object — identity, not just equal values — so the tone curve
    // is guaranteed identical across the Sun's limb. This enforces the
    // shared-curve requirement by reference rather than a constants file.
    const program = frameProgram(TONE);
    const [hdrComposite, foregroundComposite] = program.filter((step) => step.kind === 'composite');
    // Narrow away both the possibly-undefined index result and the FrameStep
    // union before touching `.step` — the same guard idiom the sibling
    // composite assertions use.
    if (hdrComposite?.kind !== 'composite' || foregroundComposite?.kind !== 'composite') {
      throw new Error('expected two composite steps');
    }
    expect(hdrComposite.step.tone).toBe(foregroundComposite.step.tone);
  });

  it('references only slabs present in deriveSlabs’ table (NEAR0 and COSMO)', () => {
    const slabs = deriveSlabs(makeCam(), new Float32Array(16) as unknown as Mat4);
    for (const step of frameProgram(TONE)) {
      if (step.kind === 'render') {
        expect([NEAR0, COSMO]).toContain(step.slab);
        expect(slabs[step.slab]).toBeDefined();
      }
    }
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

    // The foreground:0→swap slot is emitted from the program's composite STEP
    // independent of the layers fixture (a composite step always contributes
    // its '<source>→<dest>' slot). This synthetic fixture has no near-field
    // rows (no (hdr, NEAR0) star points, no foreground bodies, no NEAR0
    // captions), so those RENDER slots correctly contribute no LAYER rows — but
    // each render STEP still emits its '<target>·<SLAB>' group-key slot (the
    // merged-pass timing slot), so the empty steps show up as their group key
    // alone and the matched steps show their layers then the group total.
    expect(timedSlotsOf(frameProgram(TONE), layers)).toEqual([
      'volume·COSMO',
      'point-sprites',
      'milky-way',
      'hdr·COSMO',
      'star-aggregates·NEAR0',
      'hdr·NEAR0',
      'hdr→swap',
      'selection-ring',
      'labels',
      'swap·COSMO',
      'foreground:0·NEAR0',
      'foreground:0→swap',
      'swap·NEAR0',
      'pick',
    ]);
  });

  it('yields unique names', () => {
    const layers: readonly ContentLayer[] = [
      fakeLayer('point-sprites', 'hdr', COSMO),
      fakeLayer('selection-ring', 'swap', COSMO),
    ];
    const slots = timedSlotsOf(frameProgram(TONE), layers);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('derives the real registry slot list: scalar-volume, eight hdr, star-aggregates, the (hdr, NEAR0) five, hdr→swap, five swap, near-field tail, pick', () => {
    // The real CONTENT_LAYERS registry against the real program — the exact
    // ordered slot list the timing service allocates from and the DebugPanel
    // iterates. scalar-volume leads (the volume render step), then the eight
    // COSMO hdr layers in registry order, then star-aggregates (its OWN NEAR0
    // render step, before the hdr NEAR0 step), then milky-way + star-points +
    // orbit-trails + star-catalog + star-upsample (the dedicated (hdr, NEAR0)
    // step before the tone-map — milky-way leads that group so its
    // multiplicative dust never darkens the local starfield, and star-upsample
    // sits adjacent to the star-catalog leaf draw it composites), the tone-map
    // composite, the five swap overlays, then the near-field tail (the
    // foreground:0 body render — one slot per body layer: earth, then Earth's
    // translucent cloud-shell overlay (drawn right after the opaque surface),
    // star-spheres, field-star-sphere, planets, textured-bodies, then the
    // translucent rings overlay last — the foreground:0→swap composite, and the
    // (swap, NEAR0) render group → near0-selection-ring then foreground-labels),
    // and pick last.
    // Each render STEP trails its layers with its own '<target>·<SLAB>'
    // group-key slot (the merged-pass timing slot Joint 2 adds), so
    // 'volume·COSMO' follows scalar-volume, 'hdr·COSMO' follows the eight COSMO
    // hdr layers, and so on down to 'swap·NEAR0' after the near-field captions.
    expect(timedSlotsOf(frameProgram(TONE), CONTENT_LAYERS)).toEqual([
      'scalar-volume',
      'volume·COSMO',
      'point-sprites',
      'procedural-disks',
      'textured-disks',
      'filaments',
      'flow',
      'volume-upsample',
      'horizon-shell',
      'structure-markers',
      'hdr·COSMO',
      'star-aggregates',
      'star-aggregates·NEAR0',
      'milky-way',
      'star-points',
      'orbit-trails',
      'body-glints',
      'star-catalog',
      'star-upsample',
      'hdr·NEAR0',
      'hdr→swap',
      'selection-ring',
      'disk-radius-ring',
      'marker-lines',
      'labels',
      'clip-path-debug',
      'swap·COSMO',
      'earth',
      'cloud-shell',
      'star-spheres',
      'field-star-sphere',
      'planets',
      'textured-bodies',
      'rings',
      // Earth's in-scatter atmosphere: the LAST foreground:0 layer in registry
      // order, so its slot trails the ring's inside the foreground:0 render step
      // (before that step's foreground:0·NEAR0 group slot and the
      // foreground:0→swap composite).
      'atmosphere-shell',
      'foreground:0·NEAR0',
      'foreground:0→swap',
      'near0-selection-ring',
      'foreground-labels',
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
    // star-aggregates·NEAR0, hdr·NEAR0, swap·NEAR0 — contribute their group key
    // and their titles appear. All six groups therefore show, and each row's
    // group key buckets it under its step's title.
    const layers: readonly ContentLayer[] = [
      fakeLayer('point-sprites', 'hdr', COSMO),
      fakeLayer('milky-way', 'hdr', COSMO),
      fakeLayer('labels', 'swap', COSMO),
      fakeLayer('earth', 'foreground:0', NEAR0),
    ];
    const groups = timedSlotGroupsOf(frameProgram(TONE), layers);

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
    // step's group-key row; the two swap steps merge under Overlays.
    expect(groups.map((g) => g.rows.map((r) => r.name))).toEqual([
      ['volume·COSMO', 'star-aggregates·NEAR0'],
      ['point-sprites', 'milky-way', 'hdr·COSMO'],
      ['hdr·NEAR0'],
      ['earth', 'foreground:0·NEAR0'],
      ['labels', 'swap·COSMO', 'swap·NEAR0'],
      ['hdr→swap', 'foreground:0→swap', 'pick'],
    ]);
    // The 'Cosmos · HDR' group's first row (point-sprites) carries the step's
    // group key; the trailing infra group carries composite/composite/pick.
    expect(groups[1]!.rows[0]!.groupKey).toBe('hdr·COSMO');
    expect(groups[5]!.rows.map((r) => r.groupKey)).toEqual(['composite', 'composite', 'pick']);
  });

  it('merges scalar-volume + star-aggregates into one group and sinks composites+pick to the last group', () => {
    // The real registry against the real program — the value the DebugPanel
    // consumes. scalar-volume (volume·COSMO) and star-aggregates
    // (star-aggregates·NEAR0) are non-adjacent steps that both map to
    // "Volumes & aggregates"; the two composites and pick — scattered through
    // execution order — collapse into the trailing "Composites & pick".
    expect(TIMED_SLOT_GROUPS.map((g) => g.title)).toEqual([
      'Volumes & aggregates',
      'Cosmos · HDR',
      'Near field · HDR',
      'Foreground bodies · depth',
      'Overlays',
      'Composites & pick',
    ]);

    const byTitle = (title: string) => TIMED_SLOT_GROUPS.find((g) => g.title === title)!;
    // Each render step trails its layers with its '<target>·<SLAB>' group-key
    // row, so volume·COSMO follows scalar-volume and star-aggregates·NEAR0
    // follows star-aggregates within this merged group.
    expect(byTitle('Volumes & aggregates').rows.map((r) => r.name)).toEqual([
      'scalar-volume',
      'volume·COSMO',
      'star-aggregates',
      'star-aggregates·NEAR0',
    ]);
    // Overlays merges the COSMO swap overlays with the NEAR0 near-field swap
    // rows (two non-adjacent swap steps), each trailed by its group-key row.
    expect(byTitle('Overlays').rows.map((r) => r.name)).toEqual([
      'selection-ring',
      'disk-radius-ring',
      'marker-lines',
      'labels',
      'clip-path-debug',
      'swap·COSMO',
      'near0-selection-ring',
      'foreground-labels',
      'swap·NEAR0',
    ]);
    // Composites and pick emit no group-key rows (only render steps do), so
    // this group is unchanged.
    expect(byTitle('Composites & pick').rows.map((r) => r.name)).toEqual([
      'hdr→swap',
      'foreground:0→swap',
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
