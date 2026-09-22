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
 *
 * The Advanced sliders are driven end-to-end (prop echo + stepped callback) by
 * StarsSectionContainer.test.ts, which renders this same section behind the store.
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
    sun: { enabled: true, labelEnabled: true },
    sStar: { enabled: true, labelEnabled: false },
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
    it('is checked and indeterminate when the gate is on but a catalog is disabled (mixed)', () => {
      const { container } = render(
        createElement(StarsSection, { ...baseProps(), enabled: true, items: items(false) }),
      );
      const header = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(header.indeterminate).toBe(true);
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
  });
});
