/**
 * deriveSourceMasks — the survey draw/pick bitmask derivation.
 *
 * These tests pin the three core invariants the helper exists to enforce:
 * an enabled survey gets both bits; a survey toggled off but still fading
 * keeps its DRAW bit (smooth ramp-down) while losing its PICK bit (intent-
 * only, unclickable instantly); and a fully-faded disabled survey loses both.
 * The all-enabled case pins boot-equivalence with `ALL_VISIBLE_MASK`, the
 * construction-time seed the rest of the system relies on.
 *
 * The fixture is deliberately minimal: a settings stub whose `surveys.items`
 * covers every `SURVEY_SOURCES` id (so the loop never indexes undefined), a
 * `fades.opacityOf` stub keyed off the handle's `source`, and a `sources`
 * object with mutable masks. No GPU, no engine.
 */

import { describe, it, expect } from 'vitest';
import { deriveSourceMasks } from '../../../../src/services/engine/frame/deriveSourceMasks';
import { Source, SURVEY_SOURCES, SOURCE_REGISTRY } from '../../../../src/data/sources';
import { maskHas, ALL_VISIBLE_MASK } from '../../../../src/utils/sourceMask';
import type { SurveyId } from '../../../../src/@types/engine/data/SurveyId';
import type { FadeId } from '../../../../src/@types/animation/FadeId';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

/**
 * Build a state stub with every survey id present in `surveys.items`
 * (default enabled), a per-source opacity table, and mutable masks.
 *
 * `enabledOverrides` flips specific survey ids; `opacityBySource` supplies
 * each source's fade opacity (default 0 — fully faded). Returns the same
 * `Pick<EngineState, ...>` shape `deriveSourceMasks` accepts.
 */
function makeState(opts: {
  enabledOverrides?: Partial<Record<SurveyId, boolean>>;
  opacityBySource?: Partial<Record<number, number>>;
}): Pick<EngineState, 'sources' | 'settings' | 'subsystems'> {
  const items = Object.fromEntries(
    SURVEY_SOURCES.map((s) => {
      const id = SOURCE_REGISTRY[s].id as SurveyId;
      const enabled = opts.enabledOverrides?.[id] ?? true;
      return [id, { enabled, labelEnabled: true }];
    }),
  ) as Record<SurveyId, { enabled: boolean; labelEnabled: boolean }>;

  return {
    sources: { drawMask: 0, pickMask: 0, tier: 'medium' },
    settings: { surveys: { items } } as never,
    subsystems: {
      fades: {
        opacityOf: (id: FadeId) =>
          id.kind === 'survey' ? (opts.opacityBySource?.[id.source] ?? 0) : 0,
      },
    } as never,
  };
}

describe('deriveSourceMasks', () => {
  it('sets draw+pick bits for an enabled survey', () => {
    // Enabled with zero opacity still gets both bits — `enabled` alone drives
    // the pick bit, and `enabled || opacity>0` drives the draw bit.
    const state = makeState({ enabledOverrides: { sdss: true } });
    deriveSourceMasks(state);
    expect(maskHas(state.sources.drawMask, Source.SDSS)).toBe(true);
    expect(maskHas(state.sources.pickMask, Source.SDSS)).toBe(true);
  });

  it('keeps the draw bit but clears the pick bit for a disabled survey still fading out', () => {
    const state = makeState({
      enabledOverrides: { sdss: false },
      opacityBySource: { [Source.SDSS]: 0.5 },
    });
    deriveSourceMasks(state);
    expect(maskHas(state.sources.drawMask, Source.SDSS)).toBe(true);
    expect(maskHas(state.sources.pickMask, Source.SDSS)).toBe(false);
  });

  it('clears both bits for a disabled, fully-faded survey', () => {
    const state = makeState({
      enabledOverrides: { sdss: false },
      opacityBySource: { [Source.SDSS]: 0 },
    });
    deriveSourceMasks(state);
    expect(maskHas(state.sources.drawMask, Source.SDSS)).toBe(false);
    expect(maskHas(state.sources.pickMask, Source.SDSS)).toBe(false);
  });

  it('derives exactly ALL_VISIBLE_MASK when every survey is enabled', () => {
    // Every survey id defaults to enabled in the fixture, so this pins the
    // boot-equivalence the construction seed relies on.
    const state = makeState({});
    deriveSourceMasks(state);
    expect(state.sources.drawMask).toBe(ALL_VISIBLE_MASK);
    expect(state.sources.pickMask).toBe(ALL_VISIBLE_MASK);
  });
});
