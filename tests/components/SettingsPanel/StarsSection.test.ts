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
 * ("mixed"). With today's single `gaiaStars` catalog, "mixed" is reachable as
 * gate-on + catalog-off.
 *
 * Tests cover:
 *  - Per-catalog checkbox reflects `items[id].enabled`.
 *  - Clicking a per-catalog checkbox fires `onToggleCatalog('gaiaStars', false)`.
 *  - Master reflects allOn (checked, not indeterminate) / mixed (checked +
 *    indeterminate) / noneOn (unchecked), and clicking it fires `onToggleMaster`
 *    with the flipped gate value.
 *  - The Advanced star-size slider echoes the `sizePx` prop and fires
 *    `onSizeChange` with the parsed float when moved.
 *  - The Advanced star-brightness slider echoes the `brightness` prop and fires
 *    `onBrightnessChange` with the parsed float when moved.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import StarsSection from '../../../src/components/SettingsPanel/StarsSection';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import type { StarCatalogId } from '../../../src/@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../../src/@types/settings/StarCatalogItemSettings';

function items(gaiaEnabled: boolean): Record<StarCatalogId, StarCatalogItemSettings> {
  return { gaiaStars: { enabled: gaiaEnabled, labelEnabled: true } };
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
    famousStarsEnabled: true,
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
    onToggleFamousStars: vi.fn<(enabled: boolean) => void>(),
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

  describe('famous-stars row', () => {
    it('reflects the famousStarsEnabled prop and shows the seeded roster count chip', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), famousStarsEnabled: false }),
      );
      const toggle = container.querySelector<HTMLInputElement>('#toggle-famous-stars');
      expect(toggle).not.toBeNull();
      expect(toggle!.checked).toBe(false);
      const label = container.querySelector('label[for="toggle-famous-stars"]')!;
      expect(label.textContent).toContain('Famous stars');
      // The chip is the SEEDED roster size (a compile-time constant off the seed
      // table), styled like the mapped rows' loaded-count chip — derived here so
      // a reseed can't strand the assertion.
      const chip = label.querySelector('span');
      expect(chip).not.toBeNull();
      expect(chip!.textContent).toBe(SCENE_STARS.length.toLocaleString());
    });

    it('renders as the FIRST row in the Star catalogs list, ahead of the mapped catalogs', () => {
      const { container } = render(createElement(StarsSection, baseProps()));
      // The row toggles carry stable ids; the famous-stars toggle must precede
      // every mapped `#toggle-star-catalog-*` row in document order.
      const rowToggles = Array.from(
        container.querySelectorAll<HTMLInputElement>(
          '#toggle-famous-stars, [id^="toggle-star-catalog-"]',
        ),
      ).map((el) => el.id);
      expect(rowToggles[0]).toBe('toggle-famous-stars');
      expect(rowToggles).toContain('toggle-star-catalog-gaiaStars');
    });

    it('fires onToggleFamousStars(false) when the checked row is clicked', () => {
      const onToggleFamousStars = vi.fn<(enabled: boolean) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), famousStarsEnabled: true, onToggleFamousStars }),
      );
      const toggle = container.querySelector<HTMLInputElement>('#toggle-famous-stars')!;
      fireEvent.click(toggle);
      expect(onToggleFamousStars).toHaveBeenCalledOnce();
      expect(onToggleFamousStars).toHaveBeenCalledWith(false);
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
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), enabled: false }),
      );
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

  describe('star-size slider', () => {
    it('has value matching the sizePx prop', () => {
      const { container } = render(createElement(StarsSection, { ...baseProps(), sizePx: 4.5 }));
      const slider = container.querySelector<HTMLInputElement>('#slider-star-size');
      expect(slider).not.toBeNull();
      expect(slider!.value).toBe('4.5');
    });

    it('fires onSizeChange with the parsed float when the slider moves', () => {
      const onSizeChange = vi.fn<(v: number) => void>();
      const { container } = render(createElement(StarsSection, { ...baseProps(), onSizeChange }));
      const slider = container.querySelector<HTMLInputElement>('#slider-star-size')!;
      fireEvent.change(slider, { target: { value: '3.7' } });
      expect(onSizeChange).toHaveBeenCalledOnce();
      expect(onSizeChange).toHaveBeenCalledWith(3.7);
    });
  });

  describe('star-brightness slider', () => {
    it('has value matching the brightness prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), brightness: 2.2 }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-brightness');
      expect(slider).not.toBeNull();
      expect(slider!.value).toBe('2.2');
    });

    it('fires onBrightnessChange with the parsed float when the slider moves', () => {
      const onBrightnessChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), onBrightnessChange }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-brightness')!;
      fireEvent.change(slider, { target: { value: '0.6' } });
      expect(onBrightnessChange).toHaveBeenCalledOnce();
      expect(onBrightnessChange).toHaveBeenCalledWith(0.6);
    });
  });

  describe('Detail (refine-threshold) slider', () => {
    it('has value matching the refineThreshold prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), refineThreshold: 0.12 }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-detail');
      expect(slider).not.toBeNull();
      expect(slider!.value).toBe('0.12');
    });

    it('fires onRefineThresholdChange with the parsed float when the slider moves', () => {
      const onRefineThresholdChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), onRefineThresholdChange }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-detail')!;
      fireEvent.change(slider, { target: { value: '0.03' } });
      expect(onRefineThresholdChange).toHaveBeenCalledOnce();
      expect(onRefineThresholdChange).toHaveBeenCalledWith(0.03);
    });
  });

  describe('glow-overlap slider', () => {
    it('has value matching the glowOverlap prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), glowOverlap: 1.8 }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-glow-overlap');
      expect(slider).not.toBeNull();
      expect(slider!.value).toBe('1.8');
    });

    it('fires onGlowOverlapChange with the parsed float when the slider moves', () => {
      const onGlowOverlapChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), onGlowOverlapChange }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-glow-overlap')!;
      fireEvent.change(slider, { target: { value: '2.2' } });
      expect(onGlowOverlapChange).toHaveBeenCalledOnce();
      expect(onGlowOverlapChange).toHaveBeenCalledWith(2.2);
    });
  });

  describe('Exposure (near) slider', () => {
    it('has value matching the exposureNearX prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), exposureNearX: 30 }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-exposure-near');
      expect(slider).not.toBeNull();
      expect(slider!.value).toBe('30');
    });

    it('fires onExposureNearXChange with the parsed float when the slider moves', () => {
      const onExposureNearXChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), onExposureNearXChange }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-exposure-near')!;
      fireEvent.change(slider, { target: { value: '22.5' } });
      expect(onExposureNearXChange).toHaveBeenCalledOnce();
      expect(onExposureNearXChange).toHaveBeenCalledWith(22.5);
    });
  });

  describe('Exposure (mid) slider', () => {
    it('has value matching the exposureMidX prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), exposureMidX: 40 }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-exposure-mid');
      expect(slider).not.toBeNull();
      expect(slider!.value).toBe('40');
    });

    it('fires onExposureMidXChange with the parsed float when the slider moves', () => {
      const onExposureMidXChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), onExposureMidXChange }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-exposure-mid')!;
      fireEvent.change(slider, { target: { value: '33' } });
      expect(onExposureMidXChange).toHaveBeenCalledOnce();
      expect(onExposureMidXChange).toHaveBeenCalledWith(33);
    });
  });

  describe('Exposure (far) slider', () => {
    it('has value matching the exposureFarX prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), exposureFarX: 120 }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-exposure-far');
      expect(slider).not.toBeNull();
      expect(slider!.value).toBe('120');
    });

    it('fires onExposureFarXChange with the parsed float when the slider moves', () => {
      const onExposureFarXChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), onExposureFarXChange }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-exposure-far')!;
      fireEvent.change(slider, { target: { value: '140' } });
      expect(onExposureFarXChange).toHaveBeenCalledOnce();
      expect(onExposureFarXChange).toHaveBeenCalledWith(140);
    });
  });

  describe('Fog cap slider', () => {
    it('has value matching the aggregateIntensityCap prop', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), aggregateIntensityCap: 0.2 }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-fog-cap');
      expect(slider).not.toBeNull();
      expect(slider!.value).toBe('0.2');
    });

    it('fires onAggregateIntensityCapChange with the parsed float when the slider moves', () => {
      const onAggregateIntensityCapChange = vi.fn<(v: number) => void>();
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), onAggregateIntensityCapChange }),
      );
      const slider = container.querySelector<HTMLInputElement>('#slider-star-fog-cap')!;
      fireEvent.change(slider, { target: { value: '0.3' } });
      expect(onAggregateIntensityCapChange).toHaveBeenCalledOnce();
      expect(onAggregateIntensityCapChange).toHaveBeenCalledWith(0.3);
    });
  });
});
