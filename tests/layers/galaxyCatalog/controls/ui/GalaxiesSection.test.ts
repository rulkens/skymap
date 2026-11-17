// @vitest-environment jsdom

/**
 * GalaxiesSection — plain-props tests for the presentational Galaxies section.
 *
 * No Redux Provider: `GalaxiesSection` imports nothing from `store/` or
 * `state/`. Props drive rendering; typed `vi.fn()` spies capture callbacks.
 *
 * Tests cover:
 *  - Master tri-state: `indeterminate` when a subset of TOGGLEABLE_SOURCES
 *    bits are set; `checked` (allOn) when all are set; unchecked (noneOn)
 *    when none are set.
 *  - Per-catalog checkbox reflects `visibleCatalogs`.
 *  - Point-size Slider echoes the `pointSize` prop as its aria value.
 *  - Toggling a catalog checkbox fires `onToggleSource` with correct args.
 *  - A keyboard nudge on the point-size Slider fires `onPointSizeChange`
 *    with the stepped value.
 *
 * All-on = every galaxy catalog id; partial = SDSS + TwoMRS; none-on = empty set
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import GalaxiesSection from '../../../../../src/layers/galaxyCatalog/controls/ui/GalaxiesSection';
import { BiasMode } from '../../../../../src/data/galaxyCatalog/biasMode';
import type { BiasMode as BiasModeT } from '../../../../../src/layers/galaxyCatalog/@types/BiasMode';
import { GALAXY_CATALOG_IDS } from '../../../../../src/data/galaxyCatalog/galaxyCatalogIds';
import type { GalaxyCatalogId } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';

const ALL_ON: ReadonlySet<GalaxyCatalogId> = new Set(GALAXY_CATALOG_IDS);
// Only SDSS + TwoMRS — a strict subset → should produce indeterminate
const PARTIAL = new Set<GalaxyCatalogId>(['sdss', '2mrs']);

function baseProps() {
  return {
    title: 'Galaxies',
    visibleCatalogs: ALL_ON,
    onToggleSource: vi.fn<(source: GalaxyCatalogId, visible: boolean) => void>(),
    pointSize: 2.5,
    onPointSizeChange: vi.fn<(v: number) => void>(),
    depthFadeEnabled: true,
    onDepthFadeEnabledChange: vi.fn<(enabled: boolean) => void>(),
    biasMode: BiasMode.AngularReweight as BiasModeT,
    onBiasModeChange: vi.fn<(mode: BiasModeT) => void>(),
    absMagLimit: -19,
    onAbsMagLimitChange: vi.fn<(absMag: number) => void>(),
    sbScale: 8,
    onSbScaleChange: vi.fn<(v: number) => void>(),
    sbMax: 30,
    onSbMaxChange: vi.fn<(v: number) => void>(),
    falloffStrength: 0.8,
    onFalloffStrengthChange: vi.fn<(v: number) => void>(),
  };
}

describe('GalaxiesSection', () => {
  describe('master tri-state', () => {
    it('is indeterminate when only a subset of sources are set', () => {
      const props = { ...baseProps(), visibleCatalogs: PARTIAL };
      const { container } = render(createElement(GalaxiesSection, props));
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      // indeterminate is not a boolean attribute HTML renders — it is a DOM property
      expect(headerCheckbox.indeterminate).toBe(true);
    });
  });

  describe('per-catalog checkbox', () => {
    it('reflects visibleCatalogs for SDSS (source 1)', () => {
      const props = { ...baseProps(), visibleCatalogs: new Set<GalaxyCatalogId>(['sdss']) };
      const { container } = render(createElement(GalaxiesSection, props));
      // #toggle-source-1 = SDSS checkbox
      const sdssCheckbox = container.querySelector<HTMLInputElement>(`#toggle-source-${'sdss'}`);
      expect(sdssCheckbox).not.toBeNull();
      expect(sdssCheckbox!.checked).toBe(true);

      // TwoMRS checkbox should be unchecked
      const twomrsCheckbox = container.querySelector<HTMLInputElement>(`#toggle-source-${'2mrs'}`);
      expect(twomrsCheckbox).not.toBeNull();
      expect(twomrsCheckbox!.checked).toBe(false);
    });
  });

  describe('callbacks', () => {
    it('calls onToggleSource with source and false when a catalog checkbox is unchecked', () => {
      const onToggleSource = vi.fn<(source: GalaxyCatalogId, visible: boolean) => void>();
      const props = { ...baseProps(), visibleCatalogs: ALL_ON, onToggleSource };
      const { container } = render(createElement(GalaxiesSection, props));

      // SDSS starts checked (ALL_ON); a click toggles it off.
      // fireEvent.click is the reliable trigger for controlled checkboxes in jsdom —
      // fireEvent.change does not update e.target.checked for React-controlled inputs.
      const sdssCheckbox = container.querySelector<HTMLInputElement>(`#toggle-source-${'sdss'}`)!;
      fireEvent.click(sdssCheckbox);

      expect(onToggleSource).toHaveBeenCalledOnce();
      expect(onToggleSource).toHaveBeenCalledWith('sdss', false);
    });

    it('calls onPointSizeChange with the stepped value on a keyboard nudge', () => {
      const onPointSizeChange = vi.fn<(v: number) => void>();
      const props = { ...baseProps(), pointSize: 2.5, onPointSizeChange };
      const { container } = render(createElement(GalaxiesSection, props));

      // The Slider has no native range input; ArrowRight advances by one step
      // (0.1) from 2.5. Pointer-drag math needs a real layout rect, which jsdom
      // doesn't provide, so keyboard is the deterministic path here.
      fireEvent.keyDown(container.querySelector('[role="slider"]')!, { key: 'ArrowRight' });

      expect(onPointSizeChange).toHaveBeenCalledOnce();
      expect(onPointSizeChange).toHaveBeenCalledWith(2.6);
    });

    it('calls onToggleSource for all TOGGLEABLE_SOURCES when master is toggled from noneOn', () => {
      const onToggleSource = vi.fn<(source: GalaxyCatalogId, visible: boolean) => void>();
      const props = { ...baseProps(), visibleCatalogs: new Set<GalaxyCatalogId>(), onToggleSource };
      const { container } = render(createElement(GalaxiesSection, props));

      // Empty set: noneOn=true, so onToggle fires each source with targetEnabled=true.
      // fireEvent.click is the reliable trigger for controlled checkboxes in jsdom.
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      fireEvent.click(headerCheckbox);

      // Should call once per TOGGLEABLE_SOURCE (8 sources), each with true
      expect(onToggleSource).toHaveBeenCalledTimes(8);
      expect(onToggleSource).toHaveBeenCalledWith('famousGalaxy', true);
      expect(onToggleSource).toHaveBeenCalledWith('2mrs', true);
      expect(onToggleSource).toHaveBeenCalledWith('sdss', true);
      expect(onToggleSource).toHaveBeenCalledWith('glade', true);
      expect(onToggleSource).toHaveBeenCalledWith('milliquas', true);
      expect(onToggleSource).toHaveBeenCalledWith('desiDeep', true);
      expect(onToggleSource).toHaveBeenCalledWith('desiWedge', true);
      expect(onToggleSource).toHaveBeenCalledWith('desiSgw', true);
    });
  });
});
