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
 * `fireEvent.click(getByRole('button', { name: /display/i }))`.
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
import { ToneMapCurve } from '../../../src/data/toneMapCurve';

// ── Fixtures ───────────────────────────────────────────────────────────────────

function baseProps(overrides?: Partial<DisplaySectionProps>): DisplaySectionProps {
  return {
    toneMapCurve: ToneMapCurve.Reinhard as ToneMapCurveT,
    onToneMapCurveChange: vi.fn<(curve: ToneMapCurveT) => void>(),
    atmosphereExposure: 1.0,
    onAtmosphereExposureChange: vi.fn<(value: number) => void>(),
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
});
