// @vitest-environment jsdom

/**
 * LabelsAndGuidesSection — plain-props tests for the presentational Labels &
 * Guides section.
 *
 * No Redux Provider: `LabelsAndGuidesSection` imports nothing from `store/`
 * or `state/`. The component takes one uniform `rows` array — a label row and
 * a guide row are structurally identical here, so the test fixture mixes both
 * kinds rather than special-casing either.
 *
 * Tests cover:
 *  - Master tri-state: checked when every row is on, unchecked when every row
 *    is off, indeterminate for a mixed set.
 *  - Each row's checkbox reflects its own `enabled` and reports its own
 *    `onChange` on click, independent of the other rows.
 *  - Master toggle from noneOn calls every row's `onChange` with `true`.
 *  - Master toggle from a mixed (or allOn) set calls every row's `onChange`
 *    with `false` — the tri-state click convention clears rather than fills
 *    on anything but a strict noneOn.
 *
 * Gotchas:
 *  1) Toggle controlled checkboxes with `fireEvent.click`, NOT
 *     `fireEvent.change` with `{ target: { checked } }`.
 *  2) CollapsibleSection sets `aria-hidden` on the body wrapper when COLLAPSED
 *     (default closed). Expand the section first by clicking the header button
 *     before querying row checkboxes. The master header checkbox is always
 *     reachable (it lives in the <button> header, not the hidden body).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import LabelsAndGuidesSection from '../../../src/components/SettingsPanel/LabelsAndGuidesSection';
import type { SectionRow } from '../../../src/@types/components/SectionRow';

function makeRows(overrides: Partial<Record<string, boolean>> = {}): SectionRow[] {
  return [
    {
      id: 'toggle-label-cluster',
      label: 'Clusters',
      enabled: overrides['toggle-label-cluster'] ?? true,
      onChange: vi.fn(),
    },
    {
      id: 'toggle-label-sun',
      label: 'Sun',
      enabled: overrides['toggle-label-sun'] ?? true,
      onChange: vi.fn(),
    },
    {
      id: 'toggle-constellations',
      label: 'Constellations',
      enabled: overrides['toggle-constellations'] ?? true,
      onChange: vi.fn(),
    },
  ];
}

function headerCheckbox(container: HTMLElement): HTMLInputElement {
  return container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
}

function expandSection(container: HTMLElement): void {
  fireEvent.click(container.querySelector<HTMLButtonElement>('button[type=button]')!);
}

describe('LabelsAndGuidesSection', () => {
  describe('master tri-state', () => {
    it('is checked when every row is enabled', () => {
      const { container } = render(createElement(LabelsAndGuidesSection, { rows: makeRows() }));
      const master = headerCheckbox(container);
      expect(master.checked).toBe(true);
      expect(master.indeterminate).toBe(false);
    });

    it('is unchecked when every row is disabled', () => {
      const rows = makeRows({
        'toggle-label-cluster': false,
        'toggle-label-sun': false,
        'toggle-constellations': false,
      });
      const { container } = render(createElement(LabelsAndGuidesSection, { rows }));
      const master = headerCheckbox(container);
      expect(master.checked).toBe(false);
      expect(master.indeterminate).toBe(false);
    });

    it('is indeterminate when only some rows are enabled', () => {
      const rows = makeRows({ 'toggle-label-sun': false });
      const { container } = render(createElement(LabelsAndGuidesSection, { rows }));
      const master = headerCheckbox(container);
      expect(master.checked).toBe(false);
      expect(master.indeterminate).toBe(true);
    });
  });

  describe('rows', () => {
    it("reflects each row's enabled state and calls its own onChange on click", () => {
      const onChangeSun = vi.fn();
      const rows = makeRows();
      rows[1] = { ...rows[1]!, enabled: false, onChange: onChangeSun };
      const { container } = render(createElement(LabelsAndGuidesSection, { rows }));
      expandSection(container);

      const sunToggle = container.querySelector<HTMLInputElement>('#toggle-label-sun')!;
      expect(sunToggle.checked).toBe(false);
      fireEvent.click(sunToggle);

      expect(onChangeSun).toHaveBeenCalledOnce();
      expect(onChangeSun).toHaveBeenCalledWith(true);
      // Clicking one row's checkbox must not fire any other row's callback.
      expect(rows[0]!.onChange).not.toHaveBeenCalled();
      expect(rows[2]!.onChange).not.toHaveBeenCalled();
    });
  });

  describe('master click', () => {
    it('sets every row to true when clicked from noneOn', () => {
      const rows = makeRows({
        'toggle-label-cluster': false,
        'toggle-label-sun': false,
        'toggle-constellations': false,
      });
      const { container } = render(createElement(LabelsAndGuidesSection, { rows }));
      fireEvent.click(headerCheckbox(container));

      for (const row of rows) {
        expect(row.onChange).toHaveBeenCalledOnce();
        expect(row.onChange).toHaveBeenCalledWith(true);
      }
    });

    it('clears every row when clicked from a mixed set', () => {
      const rows = makeRows({ 'toggle-label-sun': false });
      const { container } = render(createElement(LabelsAndGuidesSection, { rows }));
      fireEvent.click(headerCheckbox(container));

      for (const row of rows) {
        expect(row.onChange).toHaveBeenCalledOnce();
        expect(row.onChange).toHaveBeenCalledWith(false);
      }
    });

    it('clears every row when clicked from allOn', () => {
      const rows = makeRows();
      const { container } = render(createElement(LabelsAndGuidesSection, { rows }));
      fireEvent.click(headerCheckbox(container));

      for (const row of rows) {
        expect(row.onChange).toHaveBeenCalledOnce();
        expect(row.onChange).toHaveBeenCalledWith(false);
      }
    });
  });
});
