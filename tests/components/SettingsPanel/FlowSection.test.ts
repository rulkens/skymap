// @vitest-environment jsdom

/**
 * FlowSection — plain-props tests for the presentational Flow section.
 *
 * No Redux Provider: `FlowSection` imports nothing from `store/` or `state/`.
 * Props drive rendering; typed `vi.fn()` spies capture callbacks.
 *
 * Tests cover:
 *  - Master toggle reflects `flow.enabled` (checked when true, unchecked when false).
 *  - Clicking the master toggle calls `onEnabledChange(<toggled>)`.
 *
 * Checkbox toggle: fireEvent.click (not fireEvent.change) — click is the
 * reliable trigger for controlled checkboxes in jsdom; change does not update
 * e.target.checked for React-controlled inputs, so the callback would receive
 * the wrong value.
 *
 * CollapsibleSection note: the body is always in the DOM but is aria-hidden when
 * collapsed (default closed). The header toggle is a CHECKBOX inside the header
 * BUTTON — distinct affordances.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import FlowSection from '../../../src/components/SettingsPanel/FlowSection';
import type { FlowSectionProps } from '../../../src/components/SettingsPanel/FlowSection';
import type { FlowSettings } from '../../../src/@types/settings/FlowSettings';
import type { FlowFieldDefaults } from '../../../src/@types/data/flow/FlowFieldDefaults';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const BASE_FLOW: FlowSettings = {
  enabled: true,
  mode: 'advect',
  intensity: 0.7,
  count: 200000,
  trail: 0.97,
  flowSpeed: 0.004,
  densityBias: 1.5,
  wander: 0.12,
  boundaryFadeWidth: 30,
};

function baseProps(overrides?: Partial<FlowSectionProps>): FlowSectionProps {
  return {
    flow: BASE_FLOW,
    onEnabledChange: vi.fn<(enabled: boolean) => void>(),
    onFlowChange: vi.fn<(patch: Partial<FlowFieldDefaults>) => void>(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FlowSection', () => {
  describe('master toggle reflects flow.enabled', () => {
    it('is checked when flow.enabled is true', () => {
      const { container } = render(
        createElement(FlowSection, baseProps({ flow: { ...BASE_FLOW, enabled: true } })),
      );
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(true);
    });

    it('is unchecked when flow.enabled is false', () => {
      const { container } = render(
        createElement(FlowSection, baseProps({ flow: { ...BASE_FLOW, enabled: false } })),
      );
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(false);
    });
  });

  describe('master toggle click calls onEnabledChange', () => {
    it('calls onEnabledChange(false) when master is clicked while enabled=true', () => {
      const onEnabledChange = vi.fn<(enabled: boolean) => void>();
      const { container } = render(
        createElement(
          FlowSection,
          baseProps({ flow: { ...BASE_FLOW, enabled: true }, onEnabledChange }),
        ),
      );
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      fireEvent.click(headerCheckbox);
      expect(onEnabledChange).toHaveBeenCalledOnce();
      expect(onEnabledChange).toHaveBeenCalledWith(false);
    });

    it('calls onEnabledChange(true) when master is clicked while enabled=false', () => {
      const onEnabledChange = vi.fn<(enabled: boolean) => void>();
      const { container } = render(
        createElement(
          FlowSection,
          baseProps({ flow: { ...BASE_FLOW, enabled: false }, onEnabledChange }),
        ),
      );
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      fireEvent.click(headerCheckbox);
      expect(onEnabledChange).toHaveBeenCalledOnce();
      expect(onEnabledChange).toHaveBeenCalledWith(true);
    });
  });
});
