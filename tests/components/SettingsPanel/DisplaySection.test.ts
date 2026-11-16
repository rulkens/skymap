// @vitest-environment jsdom

/**
 * DisplaySection — plain-props tests for the presentational Display section.
 *
 * No Redux Provider: `DisplaySection` imports nothing from `store/` or `state/`.
 * Props drive rendering; typed `vi.fn()` spies capture callbacks.
 *
 * Tests cover:
 *  - Dropdown reflects `toneMapCurve`: the `<select>` value matches the prop.
 *  - Changing the dropdown calls `onToneMapCurveChange` with the parsed numeric
 *    curve value (parseInt(value, 10) as ToneMapCurveT).
 *
 * CollapsibleSection note: the body is always in the DOM but is aria-hidden
 * when collapsed (default closed). To query controls inside the body (like the
 * tone-curve `<select>`), first expand the section with
 * `fireEvent.click(getByRole('button', { name: /display/i }))`. Bloom is a
 * further-nested CollapsibleSection with its own header toggle (the master
 * enable, mirroring FlowSection's header-toggle idiom) — the toggle itself
 * lives in the header button and is reachable once Display is open, but the
 * strength/threshold sliders live in Bloom's own body and need Bloom expanded
 * too: `fireEvent.click(getByRole('button', { name: /bloom/i }))`.
 *
 * Dropdown change: fireEvent.change(select, { target: { value: '...' } }) is
 * correct for `<select>` elements — the change event is the reliable trigger
 * for controlled selects in jsdom. The checkbox-vs-click gotcha does NOT apply
 * to selects.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { createElement } from 'react';
import DisplaySection from '../../../src/components/SettingsPanel/DisplaySection';
import type { DisplaySectionProps } from '../../../src/components/SettingsPanel/DisplaySection';
import type { ToneMapCurve as ToneMapCurveT } from '../../../src/@types/data/ToneMapCurve';
import type { OrientationFrameId } from '../../../src/@types/camera/orientation/OrientationFrameId';
import { ToneMapCurve } from '../../../src/data/toneMapCurve';
import { LENS_MIN_DEG } from '../../../src/data/camera/lensMinDeg';
import { LENS_MAX_DEG } from '../../../src/data/camera/lensMaxDeg';

// ── Fixtures ───────────────────────────────────────────────────────────────────

function baseProps(overrides?: Partial<DisplaySectionProps>): DisplaySectionProps {
  return {
    orientation: 'ecliptic',
    onOrientationChange: vi.fn<(frame: OrientationFrameId) => void>(),
    toneMapCurve: ToneMapCurve.Reinhard as ToneMapCurveT,
    onToneMapCurveChange: vi.fn<(curve: ToneMapCurveT) => void>(),
    exposure: 3.0,
    onExposureChange: vi.fn<(next: number) => void>(),
    fovDeg: 60,
    onFovDegChange: vi.fn<(next: number) => void>(),
    hdrEnabled: false,
    onHdrEnabledChange: vi.fn<(next: boolean) => void>(),
    hdrCapable: true,
    hdrKnee: 4.0,
    onHdrKneeChange: vi.fn<(next: number) => void>(),
    hdrHeadroom: 0.25,
    onHdrHeadroomChange: vi.fn<(next: number) => void>(),
    bloomEnabled: true,
    onBloomEnabledChange: vi.fn<(next: boolean) => void>(),
    bloomStrength: 0.85,
    onBloomStrengthChange: vi.fn<(next: number) => void>(),
    bloomThreshold: 7.0,
    onBloomThresholdChange: vi.fn<(next: number) => void>(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('DisplaySection', () => {
  describe('dropdown reflects toneMapCurve prop', () => {
    it('shows the correct selected value for Reinhard (1)', () => {
      const { getByRole, getByLabelText } = render(
        createElement(
          DisplaySection,
          baseProps({ toneMapCurve: ToneMapCurve.Reinhard as ToneMapCurveT }),
        ),
      );
      // Expand the section — it is collapsed by default (aria-hidden body).
      fireEvent.click(getByRole('button', { name: /display/i }));
      const select = getByLabelText(/tone curve/i) as HTMLSelectElement;
      expect(select.value).toBe(String(ToneMapCurve.Reinhard));
    });
  });

  describe('changing the dropdown calls onToneMapCurveChange', () => {
    it('calls onToneMapCurveChange with the parsed numeric curve value when changed to Linear (0)', () => {
      const onToneMapCurveChange = vi.fn<(curve: ToneMapCurveT) => void>();
      const { getByRole, getByLabelText } = render(
        createElement(
          DisplaySection,
          baseProps({
            toneMapCurve: ToneMapCurve.Reinhard as ToneMapCurveT,
            onToneMapCurveChange,
          }),
        ),
      );
      fireEvent.click(getByRole('button', { name: /display/i }));
      const select = getByLabelText(/tone curve/i);
      fireEvent.change(select, { target: { value: String(ToneMapCurve.Linear) } });
      expect(onToneMapCurveChange).toHaveBeenCalledOnce();
      expect(onToneMapCurveChange).toHaveBeenCalledWith(ToneMapCurve.Linear);
    });
  });

  describe('orientation dropdown', () => {
    it('reflects the orientation prop as the selected value', () => {
      const { getByRole, getByLabelText } = render(
        createElement(DisplaySection, baseProps({ orientation: 'galactic' })),
      );
      fireEvent.click(getByRole('button', { name: /display/i }));
      const select = getByLabelText(/orientation/i) as HTMLSelectElement;
      expect(select.value).toBe('galactic');
    });

    it('calls onOrientationChange with the selected frame id on change', () => {
      const onOrientationChange = vi.fn<(frame: OrientationFrameId) => void>();
      const { getByRole, getByLabelText } = render(
        createElement(DisplaySection, baseProps({ orientation: 'ecliptic', onOrientationChange })),
      );
      fireEvent.click(getByRole('button', { name: /display/i }));
      fireEvent.change(getByLabelText(/orientation/i), { target: { value: 'supergalactic' } });
      expect(onOrientationChange).toHaveBeenCalledOnce();
      expect(onOrientationChange).toHaveBeenCalledWith('supergalactic');
    });
  });

  describe('field of view control', () => {
    function fovSlider(fovDeg: number, onFovDegChange = vi.fn<(next: number) => void>()) {
      const { container } = render(
        createElement(DisplaySection, baseProps({ fovDeg, onFovDegChange })),
      );
      fireEvent.click(within(container).getByRole('button', { name: /display/i }));
      const sliders = Array.from(container.querySelectorAll<HTMLElement>('[role="slider"]'));
      return sliders.find((el) => el.getAttribute('aria-label') === 'Field of view')!;
    }

    // Log scale: a linear 1′–120° track would give the whole arcminute range under one pixel.
    it('a keyboard nudge zooms by a ratio, the same few percent at both ends', () => {
      const ratios = [60, 1 / 30].map((fovDeg) => {
        const onFovDegChange = vi.fn<(next: number) => void>();
        fireEvent.keyDown(fovSlider(fovDeg, onFovDegChange), { key: 'ArrowRight' });
        return onFovDegChange.mock.calls[0]![0] / fovDeg;
      });
      for (const ratio of ratios) {
        expect(ratio).toBeGreaterThan(1);
        expect(ratio).toBeLessThan(1.1);
      }
    });

    it('Home and End land on the lens range ends exactly', () => {
      const onFovDegChange = vi.fn<(next: number) => void>();
      const slider = fovSlider(60, onFovDegChange);
      fireEvent.keyDown(slider, { key: 'Home' });
      fireEvent.keyDown(slider, { key: 'End' });
      expect(onFovDegChange.mock.calls[0]![0]).toBeCloseTo(LENS_MIN_DEG, 12);
      expect(onFovDegChange.mock.calls[1]![0]).toBeCloseTo(LENS_MAX_DEG, 9);
    });

    it('reads arcminutes under a degree', () => {
      expect(fovSlider(1 / 60).getAttribute('aria-valuetext')).toBe('1′');
      expect(fovSlider(60).getAttribute('aria-valuetext')).toBe('60°');
    });
  });

  describe('bloom controls', () => {
    // Controlled checkbox: fireEvent.click (not .change) flips it and fires the
    // handler with the toggled boolean — testing.md controlled-checkbox gotcha.
    // The toggle is now Bloom's CollapsibleSection header toggle (aria-label
    // "Toggle Bloom"), reachable once Display is open — no need to also expand
    // Bloom's own body, since the header lives outside its aria-hidden wrapper.
    it('toggles bloomEnabled off via click when currently on', () => {
      const onBloomEnabledChange = vi.fn<(next: boolean) => void>();
      const { getByRole, getByLabelText } = render(
        createElement(DisplaySection, baseProps({ bloomEnabled: true, onBloomEnabledChange })),
      );
      fireEvent.click(getByRole('button', { name: /display/i }));
      fireEvent.click(getByLabelText(/toggle bloom/i));
      expect(onBloomEnabledChange).toHaveBeenCalledOnce();
      expect(onBloomEnabledChange).toHaveBeenCalledWith(false);
    });

    it('calls onBloomStrengthChange with the stepped value on a keyboard nudge', () => {
      const onBloomStrengthChange = vi.fn<(next: number) => void>();
      const { getByRole, container } = render(
        createElement(DisplaySection, baseProps({ bloomStrength: 0.85, onBloomStrengthChange })),
      );
      fireEvent.click(getByRole('button', { name: /display/i }));
      // The Strength control has no native range input; ArrowRight advances by
      // one step (0.05) from 0.85, snapped to the step grid. Per the pattern in
      // GalaxiesSection.test.ts: raw DOM query since the section body is
      // aria-hidden until expanded (Bloom's own nested body stays closed — the
      // raw query reaches the slider regardless).
      const sliders = Array.from(container.querySelectorAll<HTMLElement>('[role="slider"]'));
      const strength = sliders.find((el) => el.getAttribute('aria-label') === 'Strength')!;
      expect(strength).not.toBeUndefined();
      fireEvent.keyDown(strength, { key: 'ArrowRight' });
      expect(onBloomStrengthChange).toHaveBeenCalledOnce();
      expect(onBloomStrengthChange).toHaveBeenCalledWith(0.9);
    });
  });

  describe('HDR controls', () => {
    // Same controlled-checkbox gotcha as bloom above: fireEvent.click, not
    // .change. The toggle is HDR's CollapsibleSection header toggle
    // (aria-label "Toggle HDR"), reachable once Display is open.
    it('toggles hdrEnabled via the HDR header toggle', () => {
      const onHdrEnabledChange = vi.fn<(next: boolean) => void>();
      const { getByRole, getByLabelText } = render(
        createElement(
          DisplaySection,
          baseProps({ hdrEnabled: false, hdrCapable: true, onHdrEnabledChange }),
        ),
      );
      fireEvent.click(getByRole('button', { name: /display/i }));
      fireEvent.click(getByLabelText(/toggle hdr/i));
      expect(onHdrEnabledChange).toHaveBeenCalledOnce();
      expect(onHdrEnabledChange).toHaveBeenCalledWith(true);
    });
  });
});
