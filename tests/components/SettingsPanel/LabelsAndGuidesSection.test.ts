// @vitest-environment jsdom

/**
 * LabelsAndGuidesSection — plain-props tests for the presentational Labels &
 * Guides section.
 *
 * No Redux Provider: `LabelsAndGuidesSection` imports nothing from `store/`
 * or `state/`. Props drive rendering; typed `vi.fn()` spies capture
 * callbacks.
 *
 * LABEL_CATEGORIES spans structure ids (cluster, supercluster, void, group),
 * `famousGalaxy` (galaxy catalog), and `milkyWay` (singleton overlay). The
 * tri-state master covers all of them uniformly.
 *
 * Tests cover:
 *  - Master tri-state: indeterminate when a strict subset is enabled; checked
 *    (allOn) when all are enabled; unchecked (noneOn) when none are enabled.
 *  - Per-category checkbox reflects the `labelCategoryVisibility` prop.
 *  - Toggling a per-category checkbox calls `onSetLabelCategoryVisibility`
 *    with the correct category and new boolean.
 *  - Master toggle from noneOn calls `onSetLabelCategoryVisibility` once per
 *    category with `true`.
 *  - Master toggle from allOn calls `onSetLabelCategoryVisibility` once per
 *    category with `false`.
 *
 * Gotchas:
 *  1) Toggle controlled checkboxes with `fireEvent.click`, NOT
 *     `fireEvent.change` with `{ target: { checked } }`.
 *  2) CollapsibleSection sets `aria-hidden` on the body wrapper when COLLAPSED
 *     (default closed). Expand the section first by clicking the header button
 *     before querying per-category checkboxes. The master header checkbox is
 *     always reachable (it lives in the <button> header, not the hidden body).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import LabelsAndGuidesSection from '../../../src/components/SettingsPanel/LabelsAndGuidesSection';
import type { NonCategoryRow } from '../../../src/components/SettingsPanel/LabelsAndGuidesSection';
import { LABEL_CATEGORIES } from '../../../src/data/structure/labelCategories';
import type { LabelCategory } from '../../../src/@types/engine/data/LabelCategory';

// All label categories enabled.
function allOnVisibility(): Record<LabelCategory, boolean> {
  return Object.fromEntries(LABEL_CATEGORIES.map((cat) => [cat, true])) as Record<
    LabelCategory,
    boolean
  >;
}

// No label categories enabled.
function noneOnVisibility(): Record<LabelCategory, boolean> {
  return Object.fromEntries(LABEL_CATEGORIES.map((cat) => [cat, false])) as Record<
    LabelCategory,
    boolean
  >;
}

// Only first category enabled — guaranteed mixed (partial), producing
// indeterminate, as long as LABEL_CATEGORIES has more than one entry.
function partialVisibility(): Record<LabelCategory, boolean> {
  const result = noneOnVisibility();
  result[LABEL_CATEGORIES[0]!] = true;
  return result;
}

// The four non-category boolean rows in render order (star names, planet
// names, constellations, orbit trails) — mirrors what the container
// assembles. Each row's `enabled` and `onChange` can be overridden;
// unspecified spies are throwaway `vi.fn()`s so tests only wire up what they
// assert on.
type RowOverrides = {
  starLabelsEnabled?: boolean;
  planetLabelsEnabled?: boolean;
  constellationsEnabled?: boolean;
  orbitTrailsEnabled?: boolean;
  onSetStarLabelsEnabled?: (enabled: boolean) => void;
  onSetPlanetLabelsEnabled?: (enabled: boolean) => void;
  onToggleConstellations?: (enabled: boolean) => void;
  onToggleOrbitTrails?: (enabled: boolean) => void;
};

function makeNonCategoryRows(o: RowOverrides = {}): NonCategoryRow[] {
  return [
    {
      id: 'toggle-label-stars',
      label: 'Star names',
      enabled: o.starLabelsEnabled ?? true,
      onChange: o.onSetStarLabelsEnabled ?? vi.fn<(enabled: boolean) => void>(),
    },
    {
      id: 'toggle-label-planets',
      label: 'Planet names',
      enabled: o.planetLabelsEnabled ?? true,
      onChange: o.onSetPlanetLabelsEnabled ?? vi.fn<(enabled: boolean) => void>(),
    },
    {
      id: 'toggle-constellations',
      label: 'Constellations',
      enabled: o.constellationsEnabled ?? true,
      onChange: o.onToggleConstellations ?? vi.fn<(enabled: boolean) => void>(),
    },
    {
      id: 'toggle-orbit-trails',
      label: 'Orbit trails',
      enabled: o.orbitTrailsEnabled ?? true,
      onChange: o.onToggleOrbitTrails ?? vi.fn<(enabled: boolean) => void>(),
    },
  ];
}

function baseProps() {
  return {
    labelCategoryVisibility: allOnVisibility(),
    onSetLabelCategoryVisibility: vi.fn<(category: LabelCategory, visible: boolean) => void>(),
    nonCategoryRows: makeNonCategoryRows(),
  };
}

describe('LabelsAndGuidesSection', () => {
  describe('master tri-state', () => {
    it('reflects checked (allOn) when all categories are enabled', () => {
      const { container } = render(createElement(LabelsAndGuidesSection, baseProps()));
      // The master toggle is the first checkbox — it lives in the <button> header
      // and is always accessible regardless of collapsed state.
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(true);
      expect(headerCheckbox.indeterminate).toBe(false);
    });

    it('is indeterminate when only a subset of categories are enabled', () => {
      const props = { ...baseProps(), labelCategoryVisibility: partialVisibility() };
      const { container } = render(createElement(LabelsAndGuidesSection, props));
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      // indeterminate is a DOM property, not an HTML attribute — set imperatively
      // by CollapsibleSection via useEffect + ref.
      expect(headerCheckbox.indeterminate).toBe(true);
    });

    it('is unchecked (noneOn) when no categories and no non-category rows are enabled', () => {
      const props = {
        ...baseProps(),
        labelCategoryVisibility: noneOnVisibility(),
        nonCategoryRows: makeNonCategoryRows({
          starLabelsEnabled: false,
          planetLabelsEnabled: false,
          constellationsEnabled: false,
          orbitTrailsEnabled: false,
        }),
      };
      const { container } = render(createElement(LabelsAndGuidesSection, props));
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(false);
      expect(headerCheckbox.indeterminate).toBe(false);
    });

    it('is indeterminate when all categories are on but a non-category row is off', () => {
      // The orbit-trails row counts toward the master tri-state exactly like
      // every other non-category row: with every COSMO category on but orbit
      // trails off, the section is a mixed set — the master must read
      // indeterminate, not checked. This is the pin for the fourth row folding
      // into the master, the same way the pre-existing rows already did.
      const props = {
        ...baseProps(),
        nonCategoryRows: makeNonCategoryRows({ orbitTrailsEnabled: false }),
      };
      const { container } = render(createElement(LabelsAndGuidesSection, props));
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(false);
      expect(headerCheckbox.indeterminate).toBe(true);
    });
  });

  describe('per-category checkbox', () => {
    it('reflects labelCategoryVisibility for each category', () => {
      // famousGalaxy on, everything else off.
      const visibility = noneOnVisibility();
      visibility['famousGalaxy' as LabelCategory] = true;
      const props = { ...baseProps(), labelCategoryVisibility: visibility };
      const { container } = render(createElement(LabelsAndGuidesSection, props));

      // Expand the section to make body controls accessible.
      const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
      fireEvent.click(expandButton);

      const famousCheckbox = container.querySelector<HTMLInputElement>(
        '#toggle-label-famousGalaxy',
      );
      expect(famousCheckbox).not.toBeNull();
      expect(famousCheckbox!.checked).toBe(true);

      const milkyWayCheckbox = container.querySelector<HTMLInputElement>('#toggle-label-milkyWay');
      expect(milkyWayCheckbox).not.toBeNull();
      expect(milkyWayCheckbox!.checked).toBe(false);
    });
  });

  describe('callbacks', () => {
    it('calls onSetLabelCategoryVisibility with category and false when a checked category is clicked', () => {
      const onSetLabelCategoryVisibility =
        vi.fn<(category: LabelCategory, visible: boolean) => void>();
      const props = {
        ...baseProps(),
        labelCategoryVisibility: allOnVisibility(),
        onSetLabelCategoryVisibility,
      };
      const { container } = render(createElement(LabelsAndGuidesSection, props));

      // Expand the section so body checkboxes are reachable.
      const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
      fireEvent.click(expandButton);

      // famousGalaxy starts checked (allOnVisibility); a click toggles it off.
      // fireEvent.click is the reliable trigger for controlled checkboxes in jsdom —
      // fireEvent.change does not update e.target.checked for React-controlled inputs.
      const famousCheckbox = container.querySelector<HTMLInputElement>(
        '#toggle-label-famousGalaxy',
      )!;
      fireEvent.click(famousCheckbox);

      expect(onSetLabelCategoryVisibility).toHaveBeenCalledOnce();
      expect(onSetLabelCategoryVisibility).toHaveBeenCalledWith('famousGalaxy', false);
    });

    it('calls every category AND all non-category-row callbacks with true when master toggled from noneOn', () => {
      const onSetLabelCategoryVisibility =
        vi.fn<(category: LabelCategory, visible: boolean) => void>();
      const onSetStarLabelsEnabled = vi.fn<(enabled: boolean) => void>();
      const onSetPlanetLabelsEnabled = vi.fn<(enabled: boolean) => void>();
      const onToggleConstellations = vi.fn<(enabled: boolean) => void>();
      const onToggleOrbitTrails = vi.fn<(enabled: boolean) => void>();
      const props = {
        ...baseProps(),
        labelCategoryVisibility: noneOnVisibility(),
        onSetLabelCategoryVisibility,
        nonCategoryRows: makeNonCategoryRows({
          starLabelsEnabled: false,
          planetLabelsEnabled: false,
          constellationsEnabled: false,
          orbitTrailsEnabled: false,
          onSetStarLabelsEnabled,
          onSetPlanetLabelsEnabled,
          onToggleConstellations,
          onToggleOrbitTrails,
        }),
      };
      const { container } = render(createElement(LabelsAndGuidesSection, props));

      // noneOn → master click sets all boolean rows to true, non-category rows included.
      // Master checkbox is the first input — in the header, always accessible.
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      fireEvent.click(headerCheckbox);

      expect(onSetLabelCategoryVisibility).toHaveBeenCalledTimes(LABEL_CATEGORIES.length);
      for (const cat of LABEL_CATEGORIES) {
        expect(onSetLabelCategoryVisibility).toHaveBeenCalledWith(cat, true);
      }
      expect(onSetStarLabelsEnabled).toHaveBeenCalledWith(true);
      expect(onSetPlanetLabelsEnabled).toHaveBeenCalledWith(true);
      expect(onToggleConstellations).toHaveBeenCalledWith(true);
      expect(onToggleOrbitTrails).toHaveBeenCalledWith(true);
    });

    it('calls every category AND all non-category-row callbacks with false when master toggled from allOn', () => {
      const onSetLabelCategoryVisibility =
        vi.fn<(category: LabelCategory, visible: boolean) => void>();
      const onSetStarLabelsEnabled = vi.fn<(enabled: boolean) => void>();
      const onSetPlanetLabelsEnabled = vi.fn<(enabled: boolean) => void>();
      const onToggleConstellations = vi.fn<(enabled: boolean) => void>();
      const onToggleOrbitTrails = vi.fn<(enabled: boolean) => void>();
      const props = {
        ...baseProps(),
        labelCategoryVisibility: allOnVisibility(),
        onSetLabelCategoryVisibility,
        nonCategoryRows: makeNonCategoryRows({
          onSetStarLabelsEnabled,
          onSetPlanetLabelsEnabled,
          onToggleConstellations,
          onToggleOrbitTrails,
        }),
      };
      const { container } = render(createElement(LabelsAndGuidesSection, props));

      // allOn → master click clears every boolean row, non-category rows included.
      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      fireEvent.click(headerCheckbox);

      expect(onSetLabelCategoryVisibility).toHaveBeenCalledTimes(LABEL_CATEGORIES.length);
      for (const cat of LABEL_CATEGORIES) {
        expect(onSetLabelCategoryVisibility).toHaveBeenCalledWith(cat, false);
      }
      expect(onSetStarLabelsEnabled).toHaveBeenCalledWith(false);
      expect(onSetPlanetLabelsEnabled).toHaveBeenCalledWith(false);
      expect(onToggleConstellations).toHaveBeenCalledWith(false);
      expect(onToggleOrbitTrails).toHaveBeenCalledWith(false);
    });
  });

  describe('constellation row', () => {
    it('reflects the constellationsEnabled prop and fires onToggleConstellations when clicked', () => {
      const onToggleConstellations = vi.fn<(enabled: boolean) => void>();
      const { container } = render(
        createElement(LabelsAndGuidesSection, {
          ...baseProps(),
          nonCategoryRows: makeNonCategoryRows({
            constellationsEnabled: true,
            onToggleConstellations,
          }),
        }),
      );
      const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
      fireEvent.click(expandButton);

      const toggle = container.querySelector<HTMLInputElement>('#toggle-constellations')!;
      expect(toggle).not.toBeNull();
      expect(toggle.checked).toBe(true);
      fireEvent.click(toggle);
      expect(onToggleConstellations).toHaveBeenCalledWith(false);
    });
  });
});
