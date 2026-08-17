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
 *  - Per-catalog checkbox reflects `visibleSourceMask`.
 *  - Point-size Slider echoes the `pointSize` prop as its aria value.
 *  - Toggling a catalog checkbox fires `onToggleSource` with correct args.
 *  - A keyboard nudge on the point-size Slider fires `onPointSizeChange`
 *    with the stepped value.
 *
 * Source codes from `src/data/source.ts`:
 *   SDSS=1, TwoMRS=2, Glade=3, FamousGalaxy=4, Milliquas=8, DesiDeep=18, DesiWedge=19, DesiSgw=20
 *
 * TOGGLEABLE_SOURCES = [FamousGalaxy(4), TwoMRS(2), SDSS(1), Glade(3), Milliquas(8), DesiDeep(18), DesiWedge(19), DesiSgw(20)]
 * All-on mask = (1<<4)|(1<<2)|(1<<1)|(1<<3)|(1<<8)|(1<<18)|(1<<19)|(1<<20)
 * Partial mask (only SDSS + TwoMRS on): (1<<1)|(1<<2) = 6
 * None-on mask: 0
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import GalaxiesSection from '../../../src/components/SettingsPanel/GalaxiesSection';
import { BiasMode } from '../../../src/data/galaxyCatalog/biasMode';
import type { BiasMode as BiasModeT } from '../../../src/@types/data/galaxyCatalog/BiasMode';
import type { SourceType } from '../../../src/@types/data/SourceType';
import { Source } from '../../../src/data/source';

// All TOGGLEABLE_SOURCES bits set: FamousGalaxy(4)|TwoMRS(2)|SDSS(1)|Glade(3)|Milliquas(8)|DesiDeep(18)|DesiWedge(19)|DesiSgw(20)
const ALL_ON_MASK =
  (1 << 4) | (1 << 2) | (1 << 1) | (1 << 3) | (1 << 8) | (1 << 18) | (1 << 19) | (1 << 20);
// Only SDSS + TwoMRS — a strict subset → should produce indeterminate
const PARTIAL_MASK = (1 << Source.SDSS) | (1 << Source.TwoMRS);

function baseProps() {
  return {
    visibleSourceMask: ALL_ON_MASK,
    onToggleSource: vi.fn<(source: SourceType, visible: boolean) => void>(),
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
    it('reflects checked (allOn) when all TOGGLEABLE_SOURCES are set in the mask', () => {
      const { container } = render(createElement(GalaxiesSection, baseProps()));
      // The master toggle is the first checkbox in the CollapsibleSection header
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(true);
      expect(headerCheckbox.indeterminate).toBe(false);
    });

    it('is indeterminate when only a subset of sources are set', () => {
      const props = { ...baseProps(), visibleSourceMask: PARTIAL_MASK };
      const { container } = render(createElement(GalaxiesSection, props));
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      // indeterminate is not a boolean attribute HTML renders — it is a DOM property
      expect(headerCheckbox.indeterminate).toBe(true);
    });

    it('is unchecked (noneOn) when mask is 0', () => {
      const props = { ...baseProps(), visibleSourceMask: 0 };
      const { container } = render(createElement(GalaxiesSection, props));
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(false);
      expect(headerCheckbox.indeterminate).toBe(false);
    });
  });

  describe('per-catalog checkbox', () => {
    it('reflects the visibleSourceMask for SDSS (source 1)', () => {
      // SDSS bit set, TwoMRS not — only SDSS is in PARTIAL_MASK among SDSS|TwoMRS
      // Use a mask with only SDSS bit set: (1 << 1) = 2
      const sdssOnlyMask = 1 << Source.SDSS;
      const props = { ...baseProps(), visibleSourceMask: sdssOnlyMask };
      const { container } = render(createElement(GalaxiesSection, props));
      // #toggle-source-1 = SDSS checkbox
      const sdssCheckbox = container.querySelector<HTMLInputElement>(
        `#toggle-source-${Source.SDSS}`,
      );
      expect(sdssCheckbox).not.toBeNull();
      expect(sdssCheckbox!.checked).toBe(true);

      // TwoMRS checkbox should be unchecked
      const twomrsCheckbox = container.querySelector<HTMLInputElement>(
        `#toggle-source-${Source.TwoMRS}`,
      );
      expect(twomrsCheckbox).not.toBeNull();
      expect(twomrsCheckbox!.checked).toBe(false);
    });

    it('renders a checkbox row for DESI Deep Field', () => {
      const { container } = render(createElement(GalaxiesSection, baseProps()));
      const desiCheckbox = container.querySelector<HTMLInputElement>(
        `#toggle-source-${Source.DesiDeep}`,
      );
      expect(desiCheckbox).not.toBeNull();
      // DesiDeep's bit is part of ALL_ON_MASK, so the box renders checked.
      expect(desiCheckbox!.checked).toBe(true);
      const desiLabel = container.querySelector(`label[for="toggle-source-${Source.DesiDeep}"]`);
      expect(desiLabel).not.toBeNull();
      expect(desiLabel!.textContent).toContain('DESI Deep Field');
    });
  });

  describe('point-size slider', () => {
    it('reflects the pointSize prop as the slider value', () => {
      const props = { ...baseProps(), pointSize: 4.5 };
      const { container } = render(createElement(GalaxiesSection, props));
      // The Slider lives in the (default-collapsed) Advanced section, whose
      // wrapper is aria-hidden, so a raw DOM query rather than getByRole.
      const slider = container.querySelector('[role="slider"]')!;
      expect(slider.getAttribute('aria-valuenow')).toBe('4.5');
      expect(slider.getAttribute('aria-valuetext')).toBe('4.5 px');
    });
  });

  describe('callbacks', () => {
    it('calls onToggleSource with source and false when a catalog checkbox is unchecked', () => {
      const onToggleSource = vi.fn<(source: SourceType, visible: boolean) => void>();
      const props = { ...baseProps(), visibleSourceMask: ALL_ON_MASK, onToggleSource };
      const { container } = render(createElement(GalaxiesSection, props));

      // SDSS starts checked (ALL_ON_MASK); a click toggles it off.
      // fireEvent.click is the reliable trigger for controlled checkboxes in jsdom —
      // fireEvent.change does not update e.target.checked for React-controlled inputs.
      const sdssCheckbox = container.querySelector<HTMLInputElement>(
        `#toggle-source-${Source.SDSS}`,
      )!;
      fireEvent.click(sdssCheckbox);

      expect(onToggleSource).toHaveBeenCalledOnce();
      expect(onToggleSource).toHaveBeenCalledWith(Source.SDSS, false);
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
      const onToggleSource = vi.fn<(source: SourceType, visible: boolean) => void>();
      const props = { ...baseProps(), visibleSourceMask: 0, onToggleSource };
      const { container } = render(createElement(GalaxiesSection, props));

      // Mask=0: noneOn=true, so onToggle fires each source with targetEnabled=true.
      // fireEvent.click is the reliable trigger for controlled checkboxes in jsdom.
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      fireEvent.click(headerCheckbox);

      // Should call once per TOGGLEABLE_SOURCE (8 sources), each with true
      expect(onToggleSource).toHaveBeenCalledTimes(8);
      expect(onToggleSource).toHaveBeenCalledWith(Source.FamousGalaxy, true);
      expect(onToggleSource).toHaveBeenCalledWith(Source.TwoMRS, true);
      expect(onToggleSource).toHaveBeenCalledWith(Source.SDSS, true);
      expect(onToggleSource).toHaveBeenCalledWith(Source.Glade, true);
      expect(onToggleSource).toHaveBeenCalledWith(Source.Milliquas, true);
      expect(onToggleSource).toHaveBeenCalledWith(Source.DesiDeep, true);
      expect(onToggleSource).toHaveBeenCalledWith(Source.DesiWedge, true);
      expect(onToggleSource).toHaveBeenCalledWith(Source.DesiSgw, true);
    });

    it('calls onToggleSource with false for all TOGGLEABLE_SOURCES when master is toggled from allOn', () => {
      const onToggleSource = vi.fn<(source: SourceType, visible: boolean) => void>();
      const props = { ...baseProps(), visibleSourceMask: ALL_ON_MASK, onToggleSource };
      const { container } = render(createElement(GalaxiesSection, props));

      // Mask=ALL_ON_MASK: allOn=true, so onToggle fires each source with targetEnabled=false.
      // fireEvent.click is the reliable trigger for controlled checkboxes in jsdom.
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      fireEvent.click(headerCheckbox);

      expect(onToggleSource).toHaveBeenCalledTimes(8);
      expect(onToggleSource).toHaveBeenCalledWith(Source.FamousGalaxy, false);
      expect(onToggleSource).toHaveBeenCalledWith(Source.SDSS, false);
      expect(onToggleSource).toHaveBeenCalledWith(Source.DesiDeep, false);
      expect(onToggleSource).toHaveBeenCalledWith(Source.DesiWedge, false);
      expect(onToggleSource).toHaveBeenCalledWith(Source.DesiSgw, false);
    });
  });
});
