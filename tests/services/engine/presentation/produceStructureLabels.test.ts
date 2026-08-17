import { describe, expect, it, vi } from 'vitest';
import { produceStructureLabels } from '../../../../src/services/engine/presentation/produceStructureLabels';
import { LABEL_RECESSION } from '../../../../src/services/engine/presentation/focusRecession';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';
import type { FadeRegistry } from '../../../../src/@types/animation/FadeRegistry';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';

// Convenience factory used wherever the test doesn't care about wake behavior.
function makeRegistry(): FadeRegistry {
  return createFadeRegistry({ requestRender: () => {} });
}

// produceStructureLabels reads `state.data.structures` for the records,
// `state.settings.structures.items` for the authoritative per-category gate,
// `state.subsystems.fades` for the per-category opacity (read-only), and
// `state.selection.focus` for the focused-exempt recession.
// The fixture supplies all four; `focusedStructureId` selects which structure
// (if any) occupies the focus slot. The items bag defaults all-enabled; tests
// flip an entry to drive the disabled path.
function makeState(
  opts: { focusedStructureId?: string | null; fades?: FadeRegistry; focusedOnly?: boolean } = {},
): EngineState {
  const fades = opts.fades ?? makeRegistry();
  registerAllCategories(fades);
  const focusedStructureId = opts.focusedStructureId ?? null;
  return {
    data: createEngineData(),
    settings: {
      structures: { enabled: true, items: makeStructureItems() },
      labels: { focusedOnly: opts.focusedOnly ?? false },
    },
    selection: {
      focus: focusedStructureId === null ? null : { type: 'structure', id: focusedStructureId },
      select: null,
      hover: null,
    },
    subsystems: {
      fades,
      // clipPlayer is non-nullable; return factor 1 so the clip channel is
      // behaviour-neutral and existing assertions are unaffected.
      clipPlayer: {
        tick: vi.fn<(nowMs: number) => void>(),
        stop: vi.fn<() => void>(),
        clipOpacityOf: vi.fn<(layer: string, nowMs: number) => number>(() => 1),
        destroy: vi.fn<() => void>(),
      },
    },
  } as unknown as EngineState;
}

// All-enabled structure items bag — the authoritative ring/label gate the
// producer reads alongside the fade opacity.
function makeStructureItems(): EngineState['settings']['structures']['items'] {
  return Object.fromEntries(
    STRUCTURE_IDS.map((c) => [c, { enabled: true, labelEnabled: true }]),
  ) as EngineState['settings']['structures']['items'];
}

// Register every per-category structure label AND ring marker handle at full opacity.
// The label handle backs the producer's `opacityOf` read (which THROWS on an
// unregistered handle); the marker handle backs the anchor gate, which reads
// `opacityOf({structure, id})` so a label fades in lock-step with its
// ring instead of popping. Individual tests override a handle to 0 (or a
// mid-fade value) where they need a disabled / fading category.
function registerAllCategories(fades: FadeRegistry): void {
  for (const category of STRUCTURE_IDS) {
    fades.register({ kind: 'labelLayer', layer: 'structure', item: category }, 1);
    fades.register({ kind: 'structure', id: category }, 1);
  }
}

// The fixture camera sits 5 Mpc from the heliocentric origin — NOT at the
// origin itself, because origin distance is the surveyDeepZoom band's key and
// a camera at the origin is "deep zoom": the producer would emit nothing.
// Every record's worldPos carries the same +5 z offset so the camera-to-
// structure distances the apparent-size fades read are unchanged.
const CAM_Z = 5;

function makeCtx(over: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, CAM_Z],
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
    fovYRad: (60 * Math.PI) / 180,
    focusBlend: 0,
    nowMs: 0,
    ...over,
  } as unknown as ReadyFrameContext;
}

const rec = (id: string, over: Partial<StructureInfo> = {}): StructureInfo =>
  ({
    id,
    name: id,
    worldPos: [10, 0, CAM_Z],
    category: 'cluster',
    featured: true,
    physicalRadiusMpc: 5,
    ...over,
  }) as StructureInfo;

describe('produceStructureLabels', () => {
  it('emits a label only for featured structures', () => {
    const state = makeState();
    state.data.structures.setGroup('bulk', [rec('a'), rec('b', { featured: false })]);
    const out = produceStructureLabels(state, makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['a']);
  });

  it('wraps a long name onto two balanced lines; short names stay one line', () => {
    const state = makeState();
    state.data.structures.setGroup('anchors', [
      rec('lan', { name: 'Laniakea Supercluster' }),
      rec('virgo', { name: 'Virgo Cluster', worldPos: [0, 10, CAM_Z] }),
    ]);
    const texts = produceStructureLabels(state, makeCtx()).labels.map((l) => l.text);
    expect(texts).toEqual(['Laniakea\nSupercluster', 'Virgo Cluster']);
  });

  it('skips a label category that is disabled AND fully faded', () => {
    // Both halves of the all-or-nothing skip: the authoritative `labelEnabled`
    // boolean is false AND the labelLayer fade reached 0.
    const fades = makeRegistry();
    fades.register({ kind: 'labelLayer', layer: 'structure', item: 'cluster' }, 1);
    fades.setImmediate({ kind: 'labelLayer', layer: 'structure', item: 'cluster' }, 0);
    const state = makeState({ fades });
    state.settings.structures.items.cluster.labelEnabled = false;
    state.data.structures.setGroup('anchors', [rec('c1', { category: 'cluster' })]);
    expect(produceStructureLabels(state, makeCtx()).labels).toEqual([]);
  });

  it('emits a label whose labelEnabled is false but whose labelLayer opacity is still > 0 (fade-out tail)', () => {
    // Authoritative gate OFF, but the fade hasn't reached 0: the fade-out tail
    // must still emit so the label ramps down to invisible instead of popping.
    const fades = makeRegistry();
    fades.register({ kind: 'labelLayer', layer: 'structure', item: 'cluster' }, 1);
    fades.register({ kind: 'structure', id: 'cluster' }, 1);
    fades.setImmediate({ kind: 'labelLayer', layer: 'structure', item: 'cluster' }, 0.5);
    const state = makeState({ fades });
    state.settings.structures.items.cluster.labelEnabled = false;
    state.data.structures.setGroup('anchors', [rec('c1', { category: 'cluster' })]);
    expect(produceStructureLabels(state, makeCtx()).labels.map((l) => l.id)).toEqual(['c1']);
  });

  it('hides a structure label when its marker (ring anchor) is disabled and fully hidden', () => {
    // The anchor gate skips only when the ring is BOTH disabled (`enabled`
    // false) AND its markerLayer opacity is exactly 0.
    const fades = makeRegistry();
    fades.register({ kind: 'labelLayer', layer: 'structure', item: 'cluster' }, 1);
    fades.register({ kind: 'structure', id: 'cluster' }, 1);
    fades.setImmediate({ kind: 'structure', id: 'cluster' }, 0);
    const state = makeState({ fades });
    state.settings.structures.items.cluster.enabled = false;
    state.data.structures.setGroup('anchors', [rec('c1', { category: 'cluster' })]);
    expect(produceStructureLabels(state, makeCtx()).labels).toEqual([]);
  });

  it('a structure label survives while its ring fades out (anchor gate reads opacityOf, not an instant flag)', () => {
    // Mid-fade ring (opacity 0.5) must still carry its label — the old instant
    // markerVisible flag flipped to false the moment the category toggled off,
    // popping the label while the ring was still visibly fading. Reading the
    // fade handle keeps them in lock-step.
    const fades = makeRegistry();
    fades.register({ kind: 'labelLayer', layer: 'structure', item: 'cluster' }, 1);
    fades.register({ kind: 'structure', id: 'cluster' }, 1);
    fades.setImmediate({ kind: 'structure', id: 'cluster' }, 0.5);
    const state = makeState({ fades });
    state.data.structures.setGroup('anchors', [rec('c1', { category: 'cluster' })]);
    expect(produceStructureLabels(state, makeCtx()).labels.map((l) => l.id)).toEqual(['c1']);
  });

  it('sets prominencePx to the ring apparent radius and never declutters', () => {
    // Two featured structures at the same position → both labels emitted
    // (no internal declutter; the director de-collides later). Their
    // prominencePx equals the ring apparent radius.
    const state = makeState();
    state.data.structures.setGroup('anchors', [rec('a'), rec('b')]);
    const out = produceStructureLabels(state, makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['a', 'b']);
    // radius 5 Mpc / 10 Mpc distance × pxPerRad (= halfH/tan(fovY/2) = 540/tan(30°))
    const pxPerRad = 540 / Math.tan((30 * Math.PI) / 180);
    const expected = (5 / 10) * pxPerRad;
    expect(out.labels[0]!.prominencePx).toBeCloseTo(expected, 3);
  });

  it('fades the label out as the ring grows past the close-approach band', () => {
    // Camera very close → apparent radius far past markerMaxApparentRadiusPx
    // (700 + 400 band) → fully faded → label dropped entirely.
    const state = makeState();
    state.data.structures.setGroup('anchors', [rec('huge', { worldPos: [0.1, 0, CAM_Z] })]);
    expect(produceStructureLabels(state, makeCtx()).labels).toEqual([]);
  });

  it('fades the label out below the far-distance floor', () => {
    // Tiny apparent radius (far away, below markerMinApparentRadiusPx=5) →
    // minFadeOut 0 → dropped.
    const state = makeState();
    state.data.structures.setGroup('anchors', [rec('far', { worldPos: [100000, 0, CAM_Z] })]);
    expect(produceStructureLabels(state, makeCtx()).labels).toEqual([]);
  });

  it('bakes per-category opacityOf into fadeAlpha', () => {
    // A cluster label at 0.5 category opacity emits half the at-rest fadeAlpha.
    const atRest = makeState();
    atRest.data.structures.setGroup('anchors', [rec('a')]);
    const atRestAlpha = produceStructureLabels(atRest, makeCtx()).labels[0]!.fadeAlpha!;

    const fades = makeRegistry();
    fades.register({ kind: 'labelLayer', layer: 'structure', item: 'cluster' }, 0.5);
    const dimmed = makeState({ fades });
    dimmed.data.structures.setGroup('anchors', [rec('a')]);
    const dimmedAlpha = produceStructureLabels(dimmed, makeCtx()).labels[0]!.fadeAlpha!;

    expect(dimmedAlpha).toBeCloseTo(atRestAlpha * 0.5, 6);
  });

  it('non-focused label recedes at blend > 0', () => {
    // No focus, full blend → the label's fadeAlpha is scaled by LABEL_RECESSION.
    const atRest = makeState();
    atRest.data.structures.setGroup('anchors', [rec('a')]);
    const atRestAlpha = produceStructureLabels(atRest, makeCtx()).labels[0]!.fadeAlpha!;

    const focused = makeState();
    focused.data.structures.setGroup('anchors', [rec('a')]);
    const recededAlpha = produceStructureLabels(focused, makeCtx({ focusBlend: 1 })).labels[0]!
      .fadeAlpha!;

    expect(recededAlpha).toBeCloseTo(atRestAlpha * LABEL_RECESSION, 6);
  });

  it('focused structure label is exempt from recession', () => {
    // The focused structure's own label stays at its blend-0 value even at
    // full blend — a faded ring never carries a bright label.
    const blend0 = makeState({ focusedStructureId: 'a' });
    blend0.data.structures.setGroup('anchors', [rec('a')]);
    const blend0Alpha = produceStructureLabels(blend0, makeCtx({ focusBlend: 0 })).labels[0]!
      .fadeAlpha!;

    const blend1 = makeState({ focusedStructureId: 'a' });
    blend1.data.structures.setGroup('anchors', [rec('a')]);
    const blend1Alpha = produceStructureLabels(blend1, makeCtx({ focusBlend: 1 })).labels[0]!
      .fadeAlpha!;

    expect(blend1Alpha).toBeCloseTo(blend0Alpha, 6);
  });

  it('focusedOnly mode: emits only the focused structure label', () => {
    const state = makeState({ focusedStructureId: 'a', focusedOnly: true });
    state.data.structures.setGroup('anchors', [rec('a'), rec('b')]);
    const out = produceStructureLabels(state, makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['a']);
  });

  it('focusedOnly mode: emits nothing when no structure is focused', () => {
    const state = makeState({ focusedOnly: true });
    state.data.structures.setGroup('anchors', [rec('a'), rec('b')]);
    expect(produceStructureLabels(state, makeCtx()).labels).toEqual([]);
  });

  it('at-rest output is unchanged (blend 0, all categories at 1, no focus)', () => {
    // Golden: at rest the distance-fade fadeAlpha is unscaled (catOpacity 1 ×
    // recession 1). Two featured anchors at distance 10 Mpc sit in the flat
    // band of both fades, so fadeAlpha is exactly 1.
    const state = makeState();
    state.data.structures.setGroup('anchors', [rec('a'), rec('b')]);
    const out = produceStructureLabels(state, makeCtx());
    expect(out.labels.map((l) => l.fadeAlpha)).toEqual([1, 1]);
  });

  it('emits nothing at deep zoom — the surveyDeepZoom band empties the producer', () => {
    // Camera 0.001 Mpc from the heliocentric origin (inside the band's goneAt
    // edge). The record sits 10 Mpc from the CAMERA — squarely in the flat
    // band of both apparent-size fades, featured, all toggles on — so the
    // band factor is the only thing suppressing it.
    const state = makeState();
    state.data.structures.setGroup('anchors', [rec('a', { worldPos: [10, 0, 0.001] })]);
    const out = produceStructureLabels(
      state,
      makeCtx({ drawCamPos: [0, 0, 0.001] as Readonly<[number, number, number]> }),
    );
    expect(out.labels).toEqual([]);
  });

  it('scales fadeAlpha by a fractional band factor mid-descent', () => {
    // Camera 0.005 Mpc from the origin: strictly inside the band (goneAt
    // 0.002 < 0.005 < fullAt ≈ 0.0103), so the label FADES rather than
    // popping — a strict fraction, not the 0/1 a boolean gate would produce.
    const state = makeState();
    state.data.structures.setGroup('anchors', [rec('a', { worldPos: [10, 0, 0.005] })]);
    const out = produceStructureLabels(
      state,
      makeCtx({ drawCamPos: [0, 0, 0.005] as Readonly<[number, number, number]> }),
    );
    const alpha = out.labels[0]!.fadeAlpha!;
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });
});
