// @vitest-environment jsdom

/**
 * CosmicWebSection — plain-props tests for the presentational Cosmic web section.
 *
 * No Redux Provider: `CosmicWebSection` imports nothing from `store/` or
 * `state/`. Props drive rendering; typed `vi.fn()` spies capture callbacks.
 *
 * Tests cover:
 *  - Style picker label derives correctly from (volumesEnabled, filamentsEnabled):
 *      smooth → "Smooth" pressed, filaments → "Filaments" pressed, both → "Both"
 *      pressed, neither → picker hidden.
 *  - Master toggle reflects `volumesEnabled OR filamentsEnabled`.
 *  - Clicking "Both" calls BOTH `onVolumesEnabledChange(true)` AND
 *    `onFilamentsChange(true)`.
 *  - A `VolumeFieldRow` intensity change calls `onVolumeFieldIntensityChange`
 *    with the correct id and parsed value.
 *  - Filament intensity slider renders when `filamentsEnabled` is true and is
 *    absent when false.
 *  - Empty-state hint renders when `volumeFields` is empty.
 *
 * Checkbox toggle: fireEvent.click (not fireEvent.change) — click is the
 * reliable trigger for controlled checkboxes in jsdom; change does not update
 * e.target.checked for React-controlled inputs, so the callback would receive
 * the wrong value.
 *
 * Style picker buttons: fireEvent.click.
 * Sliders / range inputs: fireEvent.change.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import CosmicWebSection from '../../../src/components/SettingsPanel/CosmicWebSection';
import type { CosmicWebSectionProps } from '../../../src/components/SettingsPanel/CosmicWebSection';
import type { VolumeFieldRowData } from '../../../src/@types/settings/VolumeFieldRowData';
import type { VolumeFieldId } from '../../../src/@types/data/volume/VolumeFieldId';
import type { ScalarFieldPaletteId } from '../../../src/@types/data/volume/ScalarFieldPaletteId';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const MOCK_FIELD: VolumeFieldRowData = {
  id: 'cf4-density' as VolumeFieldId,
  label: 'CF-4 DM density',
  enabled: true,
  intensity: 0.5,
  contrast: 1.2,
  densityScale: 20,
  paletteId: 'coolwarm' as ScalarFieldPaletteId,
  trim: 0,
  exposure: 1,
};

function baseProps(overrides?: Partial<CosmicWebSectionProps>): CosmicWebSectionProps {
  return {
    volumesEnabled: true,
    onVolumesEnabledChange: vi.fn<(enabled: boolean) => void>(),
    filamentsEnabled: false,
    onFilamentsChange: vi.fn<(enabled: boolean) => void>(),
    filamentIntensity: 0.5,
    onFilamentIntensityChange: vi.fn<(value: number) => void>(),
    volumeFields: [MOCK_FIELD],
    onVolumeFieldEnabledChange: vi.fn<(id: VolumeFieldId, enabled: boolean) => void>(),
    onVolumeFieldIntensityChange: vi.fn<(id: VolumeFieldId, intensity: number) => void>(),
    onVolumeFieldContrastChange: vi.fn<(id: VolumeFieldId, contrast: number) => void>(),
    onVolumeFieldDensityScaleChange: vi.fn<(id: VolumeFieldId, value: number) => void>(),
    onVolumeFieldTrimChange: vi.fn<(id: VolumeFieldId, trim: number) => void>(),
    onVolumeFieldExposureChange: vi.fn<(id: VolumeFieldId, exposure: number) => void>(),
    onVolumeFieldPaletteChange:
      vi.fn<(id: VolumeFieldId, paletteId: ScalarFieldPaletteId) => void>(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CosmicWebSection', () => {
  describe('Style picker derivation', () => {
    it('marks "Smooth" as pressed when volumesEnabled=true and filamentsEnabled=false', () => {
      const { getByRole } = render(
        createElement(
          CosmicWebSection,
          baseProps({ volumesEnabled: true, filamentsEnabled: false }),
        ),
      );
      // Expand the section so picker buttons leave aria-hidden and become queryable.
      fireEvent.click(getByRole('button', { name: /cosmic web/i }));
      const smoothBtn = getByRole('button', { name: 'Smooth' });
      expect(smoothBtn.getAttribute('aria-pressed')).toBe('true');
      const filamentsBtn = getByRole('button', { name: 'Filaments' });
      expect(filamentsBtn.getAttribute('aria-pressed')).toBe('false');
      const bothBtn = getByRole('button', { name: 'Both' });
      expect(bothBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('marks "Filaments" as pressed when volumesEnabled=false and filamentsEnabled=true', () => {
      const { getByRole } = render(
        createElement(
          CosmicWebSection,
          baseProps({ volumesEnabled: false, filamentsEnabled: true }),
        ),
      );
      // Expand the section so picker buttons leave aria-hidden and become queryable.
      fireEvent.click(getByRole('button', { name: /cosmic web/i }));
      const smoothBtn = getByRole('button', { name: 'Smooth' });
      expect(smoothBtn.getAttribute('aria-pressed')).toBe('false');
      const filamentsBtn = getByRole('button', { name: 'Filaments' });
      expect(filamentsBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('marks "Both" as pressed when both are enabled', () => {
      const { getByRole } = render(
        createElement(
          CosmicWebSection,
          baseProps({ volumesEnabled: true, filamentsEnabled: true }),
        ),
      );
      // Expand the section so picker buttons leave aria-hidden and become queryable.
      fireEvent.click(getByRole('button', { name: /cosmic web/i }));
      const bothBtn = getByRole('button', { name: 'Both' });
      expect(bothBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('hides the Style picker when both volumesEnabled and filamentsEnabled are false', () => {
      const { queryByRole } = render(
        createElement(
          CosmicWebSection,
          baseProps({ volumesEnabled: false, filamentsEnabled: false }),
        ),
      );
      // No style picker buttons should be rendered
      expect(queryByRole('button', { name: 'Smooth' })).toBeNull();
      expect(queryByRole('button', { name: 'Filaments' })).toBeNull();
      expect(queryByRole('button', { name: 'Both' })).toBeNull();
    });
  });

  describe('master toggle', () => {
    it('is checked when volumesEnabled=true and filamentsEnabled=false', () => {
      const { container } = render(
        createElement(
          CosmicWebSection,
          baseProps({ volumesEnabled: true, filamentsEnabled: false }),
        ),
      );
      // The master toggle is the first checkbox in the CollapsibleSection header
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(true);
    });

    it('is checked when filamentsEnabled=true and volumesEnabled=false', () => {
      const { container } = render(
        createElement(
          CosmicWebSection,
          baseProps({ volumesEnabled: false, filamentsEnabled: true }),
        ),
      );
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(true);
    });

    it('is unchecked when both volumesEnabled and filamentsEnabled are false', () => {
      const { container } = render(
        createElement(
          CosmicWebSection,
          baseProps({ volumesEnabled: false, filamentsEnabled: false }),
        ),
      );
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(false);
    });
  });

  describe('Style picker click — "Both"', () => {
    it('calls both onVolumesEnabledChange(true) and onFilamentsChange(true) when "Both" is clicked', () => {
      const onVolumesEnabledChange = vi.fn<(enabled: boolean) => void>();
      const onFilamentsChange = vi.fn<(enabled: boolean) => void>();
      // Start in "Smooth" (volumes on, filaments off) so Both is not currently pressed
      const { getByRole } = render(
        createElement(
          CosmicWebSection,
          baseProps({
            volumesEnabled: true,
            filamentsEnabled: false,
            onVolumesEnabledChange,
            onFilamentsChange,
          }),
        ),
      );
      // Expand the section so picker buttons leave aria-hidden and become queryable.
      fireEvent.click(getByRole('button', { name: /cosmic web/i }));
      const bothBtn = getByRole('button', { name: 'Both' });
      fireEvent.click(bothBtn);

      expect(onVolumesEnabledChange).toHaveBeenCalledOnce();
      expect(onVolumesEnabledChange).toHaveBeenCalledWith(true);
      expect(onFilamentsChange).toHaveBeenCalledOnce();
      expect(onFilamentsChange).toHaveBeenCalledWith(true);
    });
  });

  describe('VolumeFieldRow intensity callback', () => {
    it('calls onVolumeFieldIntensityChange with the field id and parsed value when the intensity slider moves', () => {
      const onVolumeFieldIntensityChange = vi.fn<(id: VolumeFieldId, intensity: number) => void>();
      const { container } = render(
        createElement(
          CosmicWebSection,
          baseProps({ volumeFields: [MOCK_FIELD], onVolumeFieldIntensityChange }),
        ),
      );
      // The VolumeFieldRow intensity slider has aria-label "{label} intensity"
      const intensitySlider = container.querySelector<HTMLInputElement>(
        'input[type=range][aria-label="CF-4 DM density intensity"]',
      );
      expect(intensitySlider).not.toBeNull();
      fireEvent.change(intensitySlider!, { target: { value: '0.75' } });

      expect(onVolumeFieldIntensityChange).toHaveBeenCalledOnce();
      expect(onVolumeFieldIntensityChange).toHaveBeenCalledWith(
        'cf4-density' as VolumeFieldId,
        0.75,
      );
    });
  });

  describe('filament intensity slider', () => {
    it('renders the filament intensity slider when filamentsEnabled is true', () => {
      const { container } = render(
        createElement(
          CosmicWebSection,
          baseProps({ volumesEnabled: false, filamentsEnabled: true, filamentIntensity: 0.6 }),
        ),
      );
      const slider = container.querySelector<HTMLInputElement>('#filament-intensity');
      expect(slider).not.toBeNull();
      expect(slider!.value).toBe('0.6');
    });

    it('does not render the filament intensity slider when filamentsEnabled is false', () => {
      const { container } = render(
        createElement(
          CosmicWebSection,
          baseProps({ volumesEnabled: true, filamentsEnabled: false }),
        ),
      );
      const slider = container.querySelector<HTMLInputElement>('#filament-intensity');
      expect(slider).toBeNull();
    });
  });

  describe('empty volumeFields', () => {
    it('renders the empty-state hint when volumeFields is empty', () => {
      const { container } = render(
        createElement(CosmicWebSection, baseProps({ volumeFields: [] })),
      );
      // The hint text is "No volume fields registered."
      expect(container.textContent).toContain('No volume fields registered.');
    });
  });
});
