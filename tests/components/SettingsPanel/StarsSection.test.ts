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
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import StarsSection from '../../../src/components/SettingsPanel/StarsSection';
import type { StarCatalogId } from '../../../src/@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../../src/@types/settings/StarCatalogItemSettings';

function items(gaiaEnabled: boolean): Record<StarCatalogId, StarCatalogItemSettings> {
  return { gaiaStars: { enabled: gaiaEnabled, labelEnabled: true } };
}

function baseProps() {
  return {
    enabled: true,
    items: items(true),
    onToggleMaster: vi.fn<(enabled: boolean) => void>(),
    onToggleCatalog: vi.fn<(id: StarCatalogId, enabled: boolean) => void>(),
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
});
