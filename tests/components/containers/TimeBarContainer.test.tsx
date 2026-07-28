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
// The readout's 1 Hz *cadence* stays untested (a timer test would only re-encode
// the setInterval plumbing), but its *time base* is pinned below: the readout must
// derive its instant from performance.now(), because anchor.realMs is a
// performance.now() stamp and a Date.now() base would subtract unrelated epochs.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import TimeBarContainer from '../../../src/components/containers/TimeBarContainer';
import { createTestStore as createAppStore } from '../../support/createTestStore';
import { selectTimeState } from '../../../src/state/time/selectors';
import { setRate, setSimDays } from '../../../src/state/time/timeSlice';
import { RATE_LADDER } from '../../../src/data/time/rateLadder';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import { formatSimClock } from '../../../src/utils/time/formatSimClock';
import { julianDaysToUnixMs } from '../../../src/utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';

function makeWrapper(store: ReturnType<typeof createAppStore>['store']) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (el === null) throw new Error(`no button with aria-label "${label}"`);
  return el;
}

// The readout trigger's accessible name embeds the live time, so match the stable
// prefix rather than the whole string.
function readoutTrigger(container: HTMLElement): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>('button[aria-label^="Set date and time"]');
  if (el === null) throw new Error('no readout trigger button');
  return el;
}

function popover(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="dialog"]');
}

function dialogCount(container: HTMLElement): number {
  return container.querySelectorAll('[role="dialog"]').length;
}

// A detent row inside the rate-selector popover carries only its ladder label.
function detent(container: HTMLElement, label: string): HTMLButtonElement {
  const dialog = popover(container);
  const el =
    dialog && Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === label);
  if (!el) throw new Error(`no detent row "${label}"`);
  return el;
}

describe('TimeBarContainer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('derives the ticking readout from performance.now(), not Date.now()', () => {
    // The readout's instant comes from deriveSimDays(time, performance.now()).
    // anchor.realMs is itself a performance.now() stamp, so the time base is
    // load-bearing: a regression to Date.now() would subtract two unrelated epochs
    // and derive a garbage instant. We stub the two clocks to WILDLY divergent
    // values — a small perf-ms reading near the anchor, and a real wall-clock
    // Date.now — so the two derivations can't collide by accident.
    //
    // deriveSimDays here is only an ORACLE for the expected string; the defect
    // under guard is the call site's CHOICE of clock, not deriveSimDays itself.
    const ANCHOR_REAL_MS = 2_000; // performance.now()-scale anchor stamp
    const PERF_NOW = 12_000; // 10 real seconds on → +10 sim days at the 1 day/s detent
    const DATE_NOW = 1_800_000_000_000; // a real wall-clock epoch, ~1.8e9 s off the anchor

    vi.spyOn(performance, 'now').mockReturnValue(PERF_NOW);
    vi.spyOn(Date, 'now').mockReturnValue(DATE_NOW);

    const { store } = createAppStore();
    // Manual + playing (paused stays false), direction +1. Explicitly pin the
    // '1 day/s' detent (index 6) rather than leaning on the boot default (now
    // '1 s/s') — the guard wants a fast rate so 10 real seconds diverge the two
    // clock bases by +10 sim days, not a mere +10 sim seconds. setSimDays then
    // overwrites the anchor cleanly and leaves rateIndex untouched.
    store.dispatch(setRate({ rateIndex: 6, nowMs: ANCHOR_REAL_MS }));
    store.dispatch(
      setSimDays({ simDays: unixMsToJulianDays(Date.UTC(2030, 0, 1)), nowMs: ANCHOR_REAL_MS }),
    );

    const time = selectTimeState(store.getState());
    const expected = formatSimClock(new Date(julianDaysToUnixMs(deriveSimDays(time, PERF_NOW))));

    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    // With performance.now() → PERF_NOW the readout lands 10 sim-days past the
    // anchor. A Date.now() base would derive an instant ~1.8e9 sim-days away and
    // never format to this string.
    expect(container.textContent).toContain(expected);
    expect(readoutTrigger(container).getAttribute('aria-label')).toContain(expected);
  });

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
    // Boot rateIndex is 0 → '1 s/s' (the truthful live rate).
    const { container, rerender } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });
    expect(container.textContent).toContain('1 s/s');

    // A different detent maps to a different label — proving it's a real lookup,
    // not a baked-in string.
    store.dispatch(setRate({ rateIndex: 6, nowMs: 0 }));
    rerender(createElement(TimeBarContainer, { hidden: false }));
    expect(container.textContent).toContain('1 day/s');
    expect(container.textContent).not.toContain('1 s/s');
  });

  it('steps to a slower detent from the slower control', () => {
    const { store } = createAppStore();
    // Seed a mid-ladder detent so a step down lands on a known label.
    store.dispatch(setRate({ rateIndex: 3, nowMs: 0 }));
    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    // Slower/Faster step on pointer-down (the hold path), not click.
    fireEvent.pointerDown(button(container, 'Slower'));

    expect(selectTimeState(store.getState()).rateIndex).toBe(2);
  });

  it('the slowest detent disables Slower — no silent flip into manual', () => {
    // Boot state: live, rateIndex 0 (the slowest detent). The old code let Slower
    // still dispatch a clamped setRate, which re-anchored the live clock into
    // manual (the only visible tell being the Now button). The step must be inert
    // at the floor: the click does nothing and the clock stays live at index 0.
    const { store } = createAppStore();
    expect(selectTimeState(store.getState()).mode).toBe('live');
    expect(selectTimeState(store.getState()).rateIndex).toBe(0);

    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    fireEvent.pointerDown(button(container, 'Slower'));

    const time = selectTimeState(store.getState());
    expect(time.mode).toBe('live');
    expect(time.rateIndex).toBe(0);
  });

  it('the fastest detent disables Faster — the step is inert at the ceiling', () => {
    // Distinct wiring from the floor guard (its own handler + fasterDisabled prop),
    // so it earns its own cheap check: seeded at the top detent, Faster can't step.
    const top = RATE_LADDER.length - 1;
    const { store } = createAppStore();
    store.dispatch(setRate({ rateIndex: top, nowMs: 0 }));

    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    fireEvent.pointerDown(button(container, 'Faster'));

    expect(selectTimeState(store.getState()).rateIndex).toBe(top);
  });

  it('opens the date-entry popover on readout click', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    expect(popover(container)).toBeNull();
    fireEvent.click(readoutTrigger(container));
    expect(popover(container)).not.toBeNull();
  });

  it('jumps the clock to the committed instant (manual + paused) and closes', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    fireEvent.click(readoutTrigger(container));
    const input = container.querySelector<HTMLInputElement>('input[type="datetime-local"]');
    if (input === null) throw new Error('no datetime-local input');
    // The popover reads the field as UTC, matching the readout + `t=` param.
    fireEvent.change(input, { target: { value: '2030-06-15T12:30' } });

    // The popover now leads with a fill-only "Now" button before "Set", so select
    // the commit button by its accessible text rather than by first-child position.
    const buttons = popover(container)?.querySelectorAll<HTMLButtonElement>('button');
    const set = buttons && Array.from(buttons).find((b) => b.textContent === 'Set');
    if (!set) throw new Error('no Set button');
    fireEvent.click(set);

    const time = selectTimeState(store.getState());
    expect(time.mode).toBe('manual');
    expect(time.paused).toBe(true);
    expect(time.anchor.simDays).toBeCloseTo(
      unixMsToJulianDays(Date.UTC(2030, 5, 15, 12, 30)),
      9,
    );
    expect(popover(container)).toBeNull();
  });

  it('opens the rate selector on rate-label click', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    expect(popover(container)).toBeNull();
    fireEvent.click(button(container, 'Change speed'));

    const dialog = popover(container);
    if (dialog === null) throw new Error('rate selector did not open');
    // The list carries every ladder detent, so a couple of representative labels
    // must be present.
    expect(dialog.textContent).toContain('1 s/s');
    expect(dialog.textContent).toContain('10 yr/s');
  });

  it('sets the chosen detent and closes on rate selection', () => {
    const { store } = createAppStore();
    // Boot detent is index 0; pick a distinct one so the dispatch is unambiguous.
    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    fireEvent.click(button(container, 'Change speed'));
    fireEvent.click(detent(container, '1 day/s'));

    expect(selectTimeState(store.getState()).rateIndex).toBe(6);
    expect(popover(container)).toBeNull();
  });

  it('opening the rate selector closes the date popover (mutual exclusion)', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    fireEvent.click(readoutTrigger(container));
    expect(container.querySelector('input[type="datetime-local"]')).not.toBeNull();

    fireEvent.click(button(container, 'Change speed'));

    // Only the rate selector is open: exactly one dialog, and it's not the date
    // popover (no datetime input).
    expect(dialogCount(container)).toBe(1);
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(popover(container)?.textContent).toContain('1 day/s');
  });

  it('mousedown+click on the rate label closes an open rate selector (not reopen)', () => {
    // fireEvent.click alone doesn't reproduce the browser sequence: a real click
    // fires mousedown before click. Without excluding the trigger button from
    // the popover's outside-mousedown dismiss, that mousedown would close the
    // popover first and the same click's onClick toggle would then reopen it —
    // net effect, clicking the trigger again never closes anything.
    const { store } = createAppStore();
    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    const rateTrigger = button(container, 'Change speed');
    fireEvent.click(rateTrigger);
    expect(dialogCount(container)).toBe(1);

    fireEvent.mouseDown(rateTrigger);
    fireEvent.click(rateTrigger);

    expect(dialogCount(container)).toBe(0);
  });

  it('mousedown+click on the readout trigger closes an open date popover (not reopen)', () => {
    // Mirrors the rate-trigger guard above: without excluding the readout
    // button from the date popover's outside-mousedown dismiss, a re-click
    // would close-then-reopen instead of closing.
    const { store } = createAppStore();
    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    const trigger = readoutTrigger(container);
    fireEvent.click(trigger);
    expect(dialogCount(container)).toBe(1);

    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);

    expect(dialogCount(container)).toBe(0);
  });

  it('closes the rate selector on Esc without dispatching', () => {
    // The rate selector implements its own Esc handler (a mirror of the date
    // popover's), so it earns its own guard: Esc closes, nothing dispatches.
    const { store } = createAppStore();
    const before = selectTimeState(store.getState());
    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    fireEvent.click(button(container, 'Change speed'));
    const dialog = popover(container);
    if (dialog === null) throw new Error('rate selector did not open');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(popover(container)).toBeNull();
    expect(selectTimeState(store.getState())).toBe(before);
  });

  it('cancels the popover on Esc without dispatching', () => {
    const { store } = createAppStore();
    const before = selectTimeState(store.getState());
    const { container } = render(createElement(TimeBarContainer, { hidden: false }), {
      wrapper: makeWrapper(store),
    });

    fireEvent.click(readoutTrigger(container));
    const dialog = popover(container);
    if (dialog === null) throw new Error('popover did not open');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(popover(container)).toBeNull();
    // No action dispatched → the slice reference is untouched.
    expect(selectTimeState(store.getState())).toBe(before);
  });
});
