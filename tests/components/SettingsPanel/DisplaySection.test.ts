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
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import DisplaySection from '../../../src/components/SettingsPanel/DisplaySection';
import type { DisplaySectionProps } from '../../../src/components/SettingsPanel/DisplaySection';
import type { ToneMapCurve as ToneMapCurveT } from '../../../src/@types/data/ToneMapCurve';
import type { OrientationFrameId } from '../../../src/@types/camera/OrientationFrameId';
import { ToneMapCurve } from '../../../src/data/toneMapCurve';

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

    it('shows the correct selected value for Asinh (2)', () => {
      const { getByRole, getByLabelText } = render(
        createElement(
          DisplaySection,
          baseProps({ toneMapCurve: ToneMapCurve.Asinh as ToneMapCurveT }),
        ),
      );
      fireEvent.click(getByRole('button', { name: /display/i }));
      const select = getByLabelText(/tone curve/i) as HTMLSelectElement;
      expect(select.value).toBe(String(ToneMapCurve.Asinh));
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

    it('calls onToneMapCurveChange with the parsed numeric curve value when changed to Aces (4)', () => {
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
      fireEvent.change(select, { target: { value: String(ToneMapCurve.Aces) } });
      expect(onToneMapCurveChange).toHaveBeenCalledOnce();
      expect(onToneMapCurveChange).toHaveBeenCalledWith(ToneMapCurve.Aces);
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
    it('calls onFovDegChange with the stepped value on a keyboard nudge', () => {
      const onFovDegChange = vi.fn<(next: number) => void>();
      const { getByRole, container } = render(
        createElement(DisplaySection, baseProps({ fovDeg: 60, onFovDegChange })),
      );
      fireEvent.click(getByRole('button', { name: /display/i }));
      const sliders = Array.from(container.querySelectorAll<HTMLElement>('[role="slider"]'));
      const fov = sliders.find((el) => el.getAttribute('aria-label') === 'Field of view')!;
      expect(fov).not.toBeUndefined();
      fireEvent.keyDown(fov, { key: 'ArrowRight' });
      expect(onFovDegChange).toHaveBeenCalledOnce();
      expect(onFovDegChange).toHaveBeenCalledWith(60.5);
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
