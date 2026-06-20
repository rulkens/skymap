// @vitest-environment jsdom

/**
 * StructuresSection — plain-props tests for the presentational Structures section.
 *
 * No Redux Provider: `StructuresSection` imports nothing from `store/` or
 * `state/`. Props drive rendering; typed `vi.fn()` spies capture callbacks.
 *
 * STRUCTURE_IDS = ['cluster', 'supercluster', 'void', 'group'] (in registry order).
 * All-on: every category has markerCategoryVisibility[cat] === true.
 * None-on: every category has markerCategoryVisibility[cat] === false.
 * Partial: only 'cluster' on → mixed → indeterminate master.
 *
 * Tests cover:
 *  - Master tri-state: indeterminate when a strict subset is enabled; checked
 *    (allOn) when all are enabled; unchecked (noneOn) when none are enabled.
 *  - Per-category checkbox reflects the `markerCategoryVisibility` prop.
 *  - Toggling a per-category checkbox calls `onSetMarkerCategoryVisibility`
 *    with the correct category and new boolean.
 *  - A count renders in the label when `structureCounts` provides it.
 *  - Master toggle from noneOn calls `onSetMarkerCategoryVisibility` once per
 *    category with `true`.
 *  - Master toggle from allOn calls `onSetMarkerCategoryVisibility` once per
 *    category with `false`.
 *
 * Gotchas documented in the task brief and preserved here:
 *  1) Toggle controlled checkboxes with `fireEvent.click`, NEVER
 *     `fireEvent.change` with `{ target: { checked } }`.
 *  2) CollapsibleSection sets `aria-hidden` on the body wrapper when COLLAPSED
 *     (default closed). The per-category checkboxes live in the body, so they
 *     are rendered in the DOM but hidden. `getByRole` won't find hidden controls.
 *     Expand the section first: click the button with title "Structures" to open.
 *     The master header checkbox is always reachable (it is in the <button>
 *     header, not in the hidden body).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import StructuresSection from '../../../src/components/SettingsPanel/StructuresSection';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import type { StructureId } from '../../../src/@types/data/structure/StructureId';

// All structure categories enabled.
function allOnVisibility(): Record<StructureId, boolean> {
  return Object.fromEntries(STRUCTURE_IDS.map((cat) => [cat, true])) as Record<
    StructureId,
    boolean
  >;
}

// No structure categories enabled.
function noneOnVisibility(): Record<StructureId, boolean> {
  return Object.fromEntries(STRUCTURE_IDS.map((cat) => [cat, false])) as Record<
    StructureId,
    boolean
  >;
}

// Only first category enabled — guaranteed mixed (partial), producing indeterminate,
// as long as STRUCTURE_IDS has more than one entry.
function partialVisibility(): Record<StructureId, boolean> {
  const result = noneOnVisibility();
  result[STRUCTURE_IDS[0]!] = true;
  return result;
}

function baseProps() {
  return {
    markerCategoryVisibility: allOnVisibility(),
    onSetMarkerCategoryVisibility: vi.fn<(category: StructureId, visible: boolean) => void>(),
  };
}

describe('StructuresSection', () => {
  describe('master tri-state', () => {
    it('reflects checked (allOn) when all categories are enabled', () => {
      const { container } = render(createElement(StructuresSection, baseProps()));
      // The master toggle is the first checkbox — it lives in the <button> header
      // and is always accessible regardless of collapsed state.
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(true);
      expect(headerCheckbox.indeterminate).toBe(false);
    });

    it('is indeterminate when only a subset of categories are enabled', () => {
      const props = { ...baseProps(), markerCategoryVisibility: partialVisibility() };
      const { container } = render(createElement(StructuresSection, props));
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      // indeterminate is a DOM property, not an HTML attribute — set imperatively by
      // the CollapsibleSection via useEffect + ref.
      expect(headerCheckbox.indeterminate).toBe(true);
    });

    it('is unchecked (noneOn) when no categories are enabled', () => {
      const props = { ...baseProps(), markerCategoryVisibility: noneOnVisibility() };
      const { container } = render(createElement(StructuresSection, props));
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(false);
      expect(headerCheckbox.indeterminate).toBe(false);
    });
  });

  describe('per-category checkbox', () => {
    it('reflects markerCategoryVisibility for each category', () => {
      // cluster on, others off.
      const visibility = noneOnVisibility();
      visibility['cluster' as StructureId] = true;
      const props = { ...baseProps(), markerCategoryVisibility: visibility };
      const { container } = render(createElement(StructuresSection, props));

      // Expand the section to make body controls accessible.
      const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
      fireEvent.click(expandButton);

      const clusterCheckbox = container.querySelector<HTMLInputElement>('#toggle-marker-cluster');
      expect(clusterCheckbox).not.toBeNull();
      expect(clusterCheckbox!.checked).toBe(true);

      const supercluserCheckbox = container.querySelector<HTMLInputElement>(
        '#toggle-marker-supercluster',
      );
      expect(supercluserCheckbox).not.toBeNull();
      expect(supercluserCheckbox!.checked).toBe(false);
    });
  });

  describe('callbacks', () => {
    it('calls onSetMarkerCategoryVisibility with category and false when a checked category is clicked', () => {
      const onSetMarkerCategoryVisibility =
        vi.fn<(category: StructureId, visible: boolean) => void>();
      const props = {
        ...baseProps(),
        markerCategoryVisibility: allOnVisibility(),
        onSetMarkerCategoryVisibility,
      };
      const { container } = render(createElement(StructuresSection, props));

      // Expand the section so body checkboxes are reachable.
      const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
      fireEvent.click(expandButton);

      // cluster starts checked (allOnVisibility); a click toggles it off.
      // fireEvent.click is the reliable trigger for controlled checkboxes in jsdom —
      // fireEvent.change does not update e.target.checked for React-controlled inputs.
      const clusterCheckbox = container.querySelector<HTMLInputElement>('#toggle-marker-cluster')!;
      fireEvent.click(clusterCheckbox);

      expect(onSetMarkerCategoryVisibility).toHaveBeenCalledOnce();
      expect(onSetMarkerCategoryVisibility).toHaveBeenCalledWith('cluster', false);
    });

    it('calls onSetMarkerCategoryVisibility for all STRUCTURE_IDS when master toggled from noneOn', () => {
      const onSetMarkerCategoryVisibility =
        vi.fn<(category: StructureId, visible: boolean) => void>();
      const props = {
        ...baseProps(),
        markerCategoryVisibility: noneOnVisibility(),
        onSetMarkerCategoryVisibility,
      };
      const { container } = render(createElement(StructuresSection, props));

      // noneOn → master click sets all to true.
      // Master checkbox is the first input — in the header, always accessible.
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      fireEvent.click(headerCheckbox);

      expect(onSetMarkerCategoryVisibility).toHaveBeenCalledTimes(STRUCTURE_IDS.length);
      for (const cat of STRUCTURE_IDS) {
        expect(onSetMarkerCategoryVisibility).toHaveBeenCalledWith(cat, true);
      }
    });

    it('calls onSetMarkerCategoryVisibility with false for all STRUCTURE_IDS when master toggled from allOn', () => {
      const onSetMarkerCategoryVisibility =
        vi.fn<(category: StructureId, visible: boolean) => void>();
      const props = {
        ...baseProps(),
        markerCategoryVisibility: allOnVisibility(),
        onSetMarkerCategoryVisibility,
      };
      const { container } = render(createElement(StructuresSection, props));

      // allOn → master click sets all to false.
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      fireEvent.click(headerCheckbox);

      expect(onSetMarkerCategoryVisibility).toHaveBeenCalledTimes(STRUCTURE_IDS.length);
      for (const cat of STRUCTURE_IDS) {
        expect(onSetMarkerCategoryVisibility).toHaveBeenCalledWith(cat, false);
      }
    });
  });

  describe('structureCounts', () => {
    it('renders a count in the label when structureCounts provides it', () => {
      const props = {
        ...baseProps(),
        structureCounts: { cluster: 375 } as Partial<Record<StructureId, number>>,
      };
      const { container } = render(createElement(StructuresSection, props));

      // Expand to access body.
      const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
      fireEvent.click(expandButton);

      // The count should appear formatted in the label for 'cluster'.
      const clusterLabel = container.querySelector<HTMLLabelElement>(
        'label[for="toggle-marker-cluster"]',
      );
      expect(clusterLabel).not.toBeNull();
      expect(clusterLabel!.textContent).toContain('375');
    });

    it('omits count span when structureCounts is absent for a category', () => {
      const props = { ...baseProps() }; // no structureCounts
      const { container } = render(createElement(StructuresSection, props));

      const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
      fireEvent.click(expandButton);

      const clusterLabel = container.querySelector<HTMLLabelElement>(
        'label[for="toggle-marker-cluster"]',
      );
      expect(clusterLabel).not.toBeNull();
      // Label text should only be the display name, no number.
      expect(clusterLabel!.textContent).not.toMatch(/\d/);
    });
  });
});
