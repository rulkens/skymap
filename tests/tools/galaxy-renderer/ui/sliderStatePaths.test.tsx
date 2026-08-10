// @vitest-environment jsdom
//
// Every slider's ⓘ tip names the store path it writes, declared by hand at the
// call site (`fieldTuning.arms.cloud.radialBias`). Nothing ties that string to
// the field, so a rename leaves the tip pointing at state that no longer
// exists and the panel keeps rendering happily.
//
// Resolving the path is not enough: a copy-pasted path resolves fine and still
// names the wrong field. So each slider is DRIVEN and the declared path has to
// be where the new value landed. That also sidesteps the optional-field
// problem — most of `GalaxyParams` is unset until something writes it
// (`globularSize`, the dust-ring trio), so a read alone would find `undefined`
// at a perfectly correct path.
//
// Mounted once per Hubble category: whole groups (SPIRAL ARMS, the
// lenticular-only dust-ring trio, POPULATIONS) render for some categories only.

import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import ControlsPanel from '../../../../tools/galaxy-renderer/src/ui/ControlsPanel/ControlsPanel';
import { createGalaxyStore, type AppStore } from '../../../../tools/galaxy-renderer/src/state/createStore';
import { DEFAULT_UI_STATE } from '../../../../tools/galaxy-renderer/src/data/defaultUiState';
import { DEFAULT_GALAXY_PARAMS } from '../../../../tools/galaxy-renderer/src/data/defaultGalaxyParams';
import { DEFAULT_EXTRAS_STATE } from '../../../../tools/galaxy-renderer/src/data/defaultExtrasState';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import type { UiState } from '../../../../tools/galaxy-renderer/@types/state/UiState';
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';

/** One per `classifyHubbleType` family — each adds or drops a slider group. */
const HUBBLE_TYPES = ['SBb', 'Sb', 'S0', 'Irr', 'E0'];

const ALL_SECTIONS_OPEN = Object.fromEntries(
  Object.keys(DEFAULT_UI_STATE.openSections).map((section) => [section, true]),
) as UiState['openSections'];

function resolve(state: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      state,
    );
}

function mountPanel(type: string, fieldTuning?: GalaxyFieldTuning) {
  const store = createGalaxyStore({
    galaxy: { ...DEFAULT_GALAXY_PARAMS, type },
    ui: { ...DEFAULT_UI_STATE, openSections: ALL_SECTIONS_OPEN },
    // The satellite-count slider only mounts once the scatter is enabled.
    extras: { ...DEFAULT_EXTRAS_STATE, enabled: true },
    ...(fieldTuning ? { fieldTuning } : {}),
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store, children });
  const { container } = render(
    createElement(ControlsPanel, { fade: null, orientationDiagnostics: null }),
    { wrapper },
  );
  return { store, container };
}

/**
 * Drives every tip-labelled slider in a mounted panel once, skipping paths
 * already checked in an earlier mount (shared across Hubble-category mounts,
 * where the SAME slider re-renders every time; a fresh Set per call keeps a
 * single-mount test's assertions self-contained).
 */
function sweepPanel(store: AppStore, container: HTMLElement, checked: Set<string>, stale: string[]): void {
  const tips = Array.from(container.querySelectorAll('[role="tooltip"] code'));
  const paths = tips.map((tip) => tip.textContent ?? '');
  expect(tips).toHaveLength(container.querySelectorAll('[role="slider"]').length);
  // Within ONE panel no two sliders write the same field, so a repeat is a
  // copy-pasted path. Across panels repeats are the norm — hence the
  // per-mount check rather than a global one.
  expect(new Set(paths).size).toBe(paths.length);

  for (const tip of tips) {
    const path = tip.textContent ?? '';
    if (checked.has(path)) continue;
    checked.add(path);

    // Tip and pill are siblings under one ParamSlider root div.
    const pill = tip.closest('div')?.querySelector('[role="slider"]');
    if (!pill) throw new Error(`no slider beside the tip declaring '${path}'`);

    const before = resolve(store.getState(), path);
    fireEvent.keyDown(pill, { key: 'End' }); // -> max
    if (resolve(store.getState(), path) === before) {
      fireEvent.keyDown(pill, { key: 'Home' }); // already at max, so -> min
    }
    const after = resolve(store.getState(), path);
    if (typeof after !== 'number' || after === before) stale.push(path);
  }
}

describe('slider state paths', () => {
  // Legitimately slow: mounts the whole panel and drives every slider, five
  // times over (once per Hubble category). ~12s under load — sized ~3x that.
  it('every slider writes the field its tip names', () => {
    const checked = new Set<string>();
    const stale: string[] = [];

    for (const type of HUBBLE_TYPES) {
      const { store, container } = mountPanel(type);
      sweepPanel(store, container, checked, stale);
      cleanup();
    }

    expect(stale).toEqual([]);
    // A floor, not a count: without it a panel that renders nothing at all
    // passes every assertion above vacuously.
    expect(checked.size).toBeGreaterThan(50);
  }, 30000);

  // The sweep above only ever mounts ismMap.generator === 'fluid' (the
  // default), so IsmMapSection's AUTOMATON panel (gated at
  // ismMap.generator === 'automaton', IsmMapSection.tsx) never mounts and its
  // ~12 sliders escape the label<->path contract entirely.
  it("the AUTOMATON panel (gated behind ismMap.generator === 'automaton') also passes the contract", () => {
    const checked = new Set<string>();
    const stale: string[] = [];
    const fieldTuning: GalaxyFieldTuning = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      ismMap: { ...DEFAULT_GALAXY_FIELD_TUNING.ismMap, generator: 'automaton' },
    };

    const { store, container } = mountPanel('Sb', fieldTuning);
    sweepPanel(store, container, checked, stale);
    cleanup();

    expect(stale).toEqual([]);
    // Proves the gated panel actually mounted and got swept, not just that
    // SOME sliders elsewhere on the page did.
    expect(checked.has('fieldTuning.ismMapAutomaton.spread')).toBe(true);
    expect(checked.has('fieldTuning.ismMapAutomaton.shearRate')).toBe(true);
    expect(checked.size).toBeGreaterThan(50);
  }, 15000);
});
