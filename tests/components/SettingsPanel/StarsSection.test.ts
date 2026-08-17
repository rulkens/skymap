// @vitest-environment jsdom

/**
 * StarsSection — plain-props tests for the presentational star-catalogs section.
 *
 * No Redux Provider: `StarsSection` imports nothing from `store/` or `state/`.
 * Props drive rendering; typed `vi.fn()` spies capture callbacks.
 *
 * The Stars master differs from the Galaxies master: it reflects the real
 * `starCatalogs.enabled` gate (a boolean prop), and derives an `indeterminate`
 * visual only when the gate is on while not every catalog row is enabled
 * ("mixed") — reached here as gate-on with `gaiaStars` off.
 *
 * Tests cover:
 *  - Per-catalog checkbox reflects `items[id].enabled`.
 *  - Clicking a per-catalog checkbox fires `onToggleCatalog('gaiaStars', false)`.
 *  - Master reflects allOn (checked, not indeterminate) / mixed (checked +
 *    indeterminate) / noneOn (unchecked), and clicking it fires `onToggleMaster`
 *    with the flipped gate value.
 *  - Each Advanced Slider (star size, brightness, detail, glow overlap,
 *    exposure near/mid/far, fog cap) echoes its prop via `aria-valuenow` /
 *    `aria-valuetext`, and a keyboard nudge fires the matching `onChange`
 *    handler with the stepped value — the Slider component has no native
 *    range input, so these are queried by `[role="slider"]` +
 *    `aria-label`, per the pattern in GalaxiesSection.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import StarsSection from '../../../src/components/SettingsPanel/StarsSection';
import type { StarCatalogId } from '../../../src/@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../../src/@types/settings/StarCatalogItemSettings';

function items(gaiaEnabled: boolean): Record<StarCatalogId, StarCatalogItemSettings> {
  return {
    famousStar: { enabled: true, labelEnabled: true },
    gaiaStars: { enabled: gaiaEnabled, labelEnabled: true },
  };
}

function baseProps() {
  return {
    enabled: true,
    items: items(true),
    sizePx: 2.5,
    brightness: 1.0,
    refineThreshold: 0.05,
    glowOverlap: 1.0,
    exposureNearX: 15,
    exposureMidX: 57,
    exposureFarX: 70,
    aggregateIntensityCap: 0.06,
    onToggleMaster: vi.fn<(enabled: boolean) => void>(),
    onToggleCatalog: vi.fn<(id: StarCatalogId, enabled: boolean) => void>(),
    onSizeChange: vi.fn<(v: number) => void>(),
    onBrightnessChange: vi.fn<(v: number) => void>(),
    onRefineThresholdChange: vi.fn<(v: number) => void>(),
    onGlowOverlapChange: vi.fn<(v: number) => void>(),
    onExposureNearXChange: vi.fn<(v: number) => void>(),
    onExposureMidXChange: vi.fn<(v: number) => void>(),
    onExposureFarXChange: vi.fn<(v: number) => void>(),
    onAggregateIntensityCapChange: vi.fn<(v: number) => void>(),
  };
}

describe('StarsSection', () => {
  describe('per-catalog checkbox', () => {
    it('reflects items[id].enabled for gaiaStars', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), items: items(false) }),
      );
      const gaia = container.querySelector<HTMLInputElement>('#toggle-star-catalog-gaiaStars');
      expect(gaia).not.toBeNull();
      expect(gaia!.checked).toBe(false);
      const label = container.querySelector('label[for="toggle-star-catalog-gaiaStars"]');
      expect(label).not.toBeNull();
      expect(label!.textContent).toContain('Gaia Stars');
    });

    it('fires onToggleCatalog with (gaiaStars, false) when the checked row is clicked', () => {
      const onToggleCatalog = vi.fn<(id: StarCatalogId, enabled: boolean) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), items: items(true), onToggleCatalog }),
      );
      const gaia = container.querySelector<HTMLInputElement>('#toggle-star-catalog-gaiaStars')!;
      fireEvent.click(gaia);
      expect(onToggleCatalog).toHaveBeenCalledOnce();
      expect(onToggleCatalog).toHaveBeenCalledWith('gaiaStars', false);
    });
  });

  describe('loaded-count chip', () => {
    it('renders the formatted count next to the catalog label when present', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), counts: { gaiaStars: 1234567 } }),
      );
      const label = container.querySelector('label[for="toggle-star-catalog-gaiaStars"]')!;
      const chip = label.querySelector('span');
      expect(chip).not.toBeNull();
      expect(chip!.textContent).toBe((1234567).toLocaleString());
    });

    it('renders no chip when the count is absent (not yet loaded)', () => {
      const { container } = render(createElement(StarsSection, baseProps()));
      const label = container.querySelector('label[for="toggle-star-catalog-gaiaStars"]')!;
      expect(label.querySelector('span')).toBeNull();
    });
  });

  describe('master tri-state', () => {
    it('is checked and not indeterminate when the gate is on and every catalog is enabled (allOn)', () => {
      const { container } = render(createElement(StarsSection, baseProps()));
      const header = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(header.checked).toBe(true);
      expect(header.indeterminate).toBe(false);
    });

    it('is checked and indeterminate when the gate is on but a catalog is disabled (mixed)', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), enabled: true, items: items(false) }),
      );
      const header = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(header.indeterminate).toBe(true);
    });

    it('is unchecked when the gate is off (noneOn)', () => {
      const { container } = render(createElement(StarsSection, { ...baseProps(), enabled: false }));
      const header = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(header.checked).toBe(false);
      expect(header.indeterminate).toBe(false);
    });

    it('fires onToggleMaster(false) when the checked master is clicked', () => {
      const onToggleMaster = vi.fn<(enabled: boolean) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), enabled: true, onToggleMaster }),
      );
      const header = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      fireEvent.click(header);
      expect(onToggleMaster).toHaveBeenCalledOnce();
      expect(onToggleMaster).toHaveBeenCalledWith(false);
    });

    it('fires onToggleMaster(true) when the unchecked master is clicked', () => {
      const onToggleMaster = vi.fn<(enabled: boolean) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), enabled: false, onToggleMaster }),
      );
      const header = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      fireEvent.click(header);
      expect(onToggleMaster).toHaveBeenCalledOnce();
      expect(onToggleMaster).toHaveBeenCalledWith(true);
    });
  });

  // The Advanced sliders have no native range input; each is queried from the
  // (default-collapsed, aria-hidden) Advanced section by role + aria-label,
  // per the pattern in GalaxiesSection.test.ts. ArrowRight nudges by one step.
  function sliderByLabel(container: HTMLElement, label: string): HTMLElement {
    const sliders = Array.from(container.querySelectorAll<HTMLElement>('[role="slider"]'));
    const match = sliders.find((el) => el.getAttribute('aria-label') === label);
    expect(match).not.toBeUndefined();
    return match!;
  }

  describe('star-size slider', () => {
    it('has value matching the sizePx prop', () => {
      const { container } = render(createElement(StarsSection, { ...baseProps(), sizePx: 4.5 }));
      const slider = sliderByLabel(container, 'Star size');
      expect(slider.getAttribute('aria-valuenow')).toBe('4.5');
      expect(slider.getAttribute('aria-valuetext')).toBe('4.5 px');
    });

    it('fires onSizeChange with the stepped value on a keyboard nudge', () => {
      const onSizeChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), sizePx: 3.6, onSizeChange }),
      );
      fireEvent.keyDown(sliderByLabel(container, 'Star size'), { key: 'ArrowRight' });
      expect(onSizeChange).toHaveBeenCalledOnce();
      expect(onSizeChange).toHaveBeenCalledWith(3.7);
    });
  });

  describe('star-brightness slider', () => {
    it('has value matching the brightness prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), brightness: 2.2 }),
      );
      const slider = sliderByLabel(container, 'Star brightness');
      expect(slider.getAttribute('aria-valuenow')).toBe('2.2');
      expect(slider.getAttribute('aria-valuetext')).toBe('2.2×');
    });

    it('fires onBrightnessChange with the stepped value on a keyboard nudge', () => {
      const onBrightnessChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), brightness: 0.56, onBrightnessChange }),
      );
      fireEvent.keyDown(sliderByLabel(container, 'Star brightness'), { key: 'ArrowRight' });
      expect(onBrightnessChange).toHaveBeenCalledOnce();
      expect(onBrightnessChange).toHaveBeenCalledWith(0.61);
    });
  });

  describe('Detail (refine-threshold) slider', () => {
    it('has value matching the refineThreshold prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), refineThreshold: 0.12 }),
      );
      const slider = sliderByLabel(container, 'Detail');
      expect(slider.getAttribute('aria-valuenow')).toBe('0.12');
      expect(slider.getAttribute('aria-valuetext')).toBe('0.12');
    });

    it('fires onRefineThresholdChange with the stepped value on a keyboard nudge', () => {
      const onRefineThresholdChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, {
          ...baseProps(),
          refineThreshold: 0.02,
          onRefineThresholdChange,
        }),
      );
      fireEvent.keyDown(sliderByLabel(container, 'Detail'), { key: 'ArrowRight' });
      expect(onRefineThresholdChange).toHaveBeenCalledOnce();
      expect(onRefineThresholdChange).toHaveBeenCalledWith(0.03);
    });
  });

  describe('glow-overlap slider', () => {
    it('has value matching the glowOverlap prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), glowOverlap: 1.8 }),
      );
      const slider = sliderByLabel(container, 'Glow overlap');
      expect(slider.getAttribute('aria-valuenow')).toBe('1.8');
      expect(slider.getAttribute('aria-valuetext')).toBe('1.8×');
    });

    it('fires onGlowOverlapChange with the stepped value on a keyboard nudge', () => {
      const onGlowOverlapChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), glowOverlap: 2.1, onGlowOverlapChange }),
      );
      fireEvent.keyDown(sliderByLabel(container, 'Glow overlap'), { key: 'ArrowRight' });
      expect(onGlowOverlapChange).toHaveBeenCalledOnce();
      expect(onGlowOverlapChange).toHaveBeenCalledWith(2.2);
    });
  });

  describe('Exposure (near) slider', () => {
    it('has value matching the exposureNearX prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), exposureNearX: 30 }),
      );
      const slider = sliderByLabel(container, 'Exposure (near)');
      expect(slider.getAttribute('aria-valuenow')).toBe('30');
      expect(slider.getAttribute('aria-valuetext')).toBe('30.0×');
    });

    it('fires onExposureNearXChange with the stepped value on a keyboard nudge', () => {
      const onExposureNearXChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, {
          ...baseProps(),
          exposureNearX: 22,
          onExposureNearXChange,
        }),
      );
      fireEvent.keyDown(sliderByLabel(container, 'Exposure (near)'), { key: 'ArrowRight' });
      expect(onExposureNearXChange).toHaveBeenCalledOnce();
      expect(onExposureNearXChange).toHaveBeenCalledWith(22.5);
    });
  });

  describe('Exposure (mid) slider', () => {
    it('has value matching the exposureMidX prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), exposureMidX: 40 }),
      );
      const slider = sliderByLabel(container, 'Exposure (mid)');
      expect(slider.getAttribute('aria-valuenow')).toBe('40');
      expect(slider.getAttribute('aria-valuetext')).toBe('40×');
    });

    it('fires onExposureMidXChange with the stepped value on a keyboard nudge', () => {
      const onExposureMidXChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), exposureMidX: 32, onExposureMidXChange }),
      );
      fireEvent.keyDown(sliderByLabel(container, 'Exposure (mid)'), { key: 'ArrowRight' });
      expect(onExposureMidXChange).toHaveBeenCalledOnce();
      expect(onExposureMidXChange).toHaveBeenCalledWith(33);
    });
  });

  describe('Exposure (far) slider', () => {
    it('has value matching the exposureFarX prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), exposureFarX: 120 }),
      );
      const slider = sliderByLabel(container, 'Exposure (far)');
      expect(slider.getAttribute('aria-valuenow')).toBe('120');
      expect(slider.getAttribute('aria-valuetext')).toBe('120×');
    });

    it('fires onExposureFarXChange with the stepped value on a keyboard nudge', () => {
      const onExposureFarXChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), exposureFarX: 139, onExposureFarXChange }),
      );
      fireEvent.keyDown(sliderByLabel(container, 'Exposure (far)'), { key: 'ArrowRight' });
      expect(onExposureFarXChange).toHaveBeenCalledOnce();
      expect(onExposureFarXChange).toHaveBeenCalledWith(140);
    });
  });

  describe('Fog cap slider', () => {
    it('has value matching the aggregateIntensityCap prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), aggregateIntensityCap: 0.2 }),
      );
      const slider = sliderByLabel(container, 'Fog cap');
      expect(slider.getAttribute('aria-valuenow')).toBe('0.2');
      expect(slider.getAttribute('aria-valuetext')).toBe('0.20');
    });

    it('fires onAggregateIntensityCapChange with the stepped value on a keyboard nudge', () => {
      const onAggregateIntensityCapChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, {
          ...baseProps(),
          aggregateIntensityCap: 0.29,
          onAggregateIntensityCapChange,
        }),
      );
      fireEvent.keyDown(sliderByLabel(container, 'Fog cap'), { key: 'ArrowRight' });
      expect(onAggregateIntensityCapChange).toHaveBeenCalledOnce();
      expect(onAggregateIntensityCapChange).toHaveBeenCalledWith(0.3);
    });
  });
});
