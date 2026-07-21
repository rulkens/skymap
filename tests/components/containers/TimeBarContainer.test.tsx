// @vitest-environment jsdom
//
// TimeBarContainer — store-boundary coverage for the sim clock transport bar.
//
// The container's job is to map each TimeBar control onto the matching
// re-anchoring intent action and to surface the current ladder label. These
// tests drive a real store (createAppStore + <Provider>), click the rendered
// controls, and assert the intent slice moved the way the button promised —
// asserting on store state (not CSS class names) keeps the contract stable.
//
// The readout's 1 Hz tick is deliberately untested: it re-derives a value the
// unit suites for deriveSimDays / formatSimClock already cover, and a timer test
// would only re-encode that plumbing.

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import TimeBarContainer from '../../../src/components/containers/TimeBarContainer';
import { createAppStore } from '../../../src/store/createAppStore';
import { selectTimeState } from '../../../src/state/time/selectors';
import { setRate } from '../../../src/state/time/timeSlice';

function makeWrapper(store: ReturnType<typeof createAppStore>['store']) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (el === null) throw new Error(`no button with aria-label "${label}"`);
  return el;
}

describe('TimeBarContainer', () => {
  it('dispatches goLive on the now button', () => {
    const { store } = createAppStore();
    // The "Now" button only renders in manual mode, so leave live first.
    store.dispatch(setRate({ rateIndex: 2, nowMs: 0 }));
    expect(selectTimeState(store.getState()).mode).toBe('manual');

    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    fireEvent.click(button(container, 'Return to now'));

    expect(selectTimeState(store.getState()).mode).toBe('live');
  });

  it('dispatches pause/resume from the play toggle', () => {
    const { store } = createAppStore();
    // Default store: paused=false.
    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    // paused=false → the toggle reads "Pause" and pauses.
    fireEvent.click(button(container, 'Pause'));
    expect(selectTimeState(store.getState()).paused).toBe(true);

    // Now paused=true → the toggle reads "Play" and resumes.
    fireEvent.click(button(container, 'Play'));
    expect(selectTimeState(store.getState()).paused).toBe(false);
  });

  it('maps rateIndex to the RATE_LADDER label', () => {
    const { store } = createAppStore();
    // Default rateIndex is 3 → '1 day/s'.
    const { container, rerender } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });
    expect(container.textContent).toContain('1 day/s');

    // A different detent maps to a different label — proving it's a real lookup,
    // not a baked-in string.
    store.dispatch(setRate({ rateIndex: 0, nowMs: 0 }));
    rerender(createElement(TimeBarContainer, { hidden: false }));
    expect(container.textContent).toContain('1 s/s');
    expect(container.textContent).not.toContain('1 day/s');
  });

  it('steps to a slower detent from the slower control', () => {
    const { store } = createAppStore();
    // Seed a mid-ladder detent so a step down lands on a known label.
    store.dispatch(setRate({ rateIndex: 3, nowMs: 0 }));
    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    fireEvent.click(button(container, 'Slower'));

    expect(selectTimeState(store.getState()).rateIndex).toBe(2);
  });
});
