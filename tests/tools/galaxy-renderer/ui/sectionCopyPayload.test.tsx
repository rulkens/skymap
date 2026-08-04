// @vitest-environment jsdom
//
// The header copy control exists so a value tuned by eye reaches its default
// site without a label-to-field guess, which makes exactly two things worth
// pinning: the payload is keyed by the section's real store path and carries
// the LIVE value (a stale or mis-keyed block writes a wrong default silently,
// which is the failure the control was built to remove), and clicking it does
// not fold the section — the classic bubbling bug for a button in a
// collapsible header.
//
// ArmFieldSection stands in for every section: it is the one that splits a
// state node with a sibling section, so it also pins that `cloud` stays out.

import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import ArmFieldSection from '../../../../tools/galaxy-renderer/src/ui/ArmFieldSection/ArmFieldSection';
import { createGalaxyStore } from '../../../../tools/galaxy-renderer/src/state/createStore';
import { fieldTuningPatched } from '../../../../tools/galaxy-renderer/src/state/slices/fieldTuningSlice';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';

function mount(store: ReturnType<typeof createGalaxyStore>) {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store, children });
  const { container } = render(createElement(ArmFieldSection), { wrapper });
  const button = container.querySelector<HTMLButtonElement>('button[title^="Copy"]');
  if (button === null) throw new Error('no copy button in the section header');
  return { writeText, button };
}

describe('section copy control', () => {
  it('copies the live section values under their own store path', () => {
    const store = createGalaxyStore();
    store.dispatch(
      fieldTuningPatched({ arms: { ...DEFAULT_GALAXY_FIELD_TUNING.arms, contrast: 3.14 } }),
    );
    const { writeText, button } = mount(store);

    fireEvent.click(button);

    expect(writeText).toHaveBeenCalledTimes(1);
    const payload: unknown = JSON.parse(writeText.mock.calls[0]![0]);
    const { cloud: _cloud, ...ridge } = store.getState().fieldTuning.arms;
    expect(payload).toEqual({ fieldTuning: { arms: { ...ridge, contrast: 3.14 } } });
  });

  it('does not fold the section it sits in', () => {
    const store = createGalaxyStore();
    const openBefore = store.getState().ui.openSections.armField;
    const { button } = mount(store);

    fireEvent.click(button);

    expect(store.getState().ui.openSections.armField).toBe(openBefore);
  });
});
