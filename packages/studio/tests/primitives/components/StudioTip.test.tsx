// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudioTip from '../../../src/primitives/components/StudioTip/StudioTip';

// jsdom has no Popover API: model open/closed so `:popover-open` and the calls agree.
const open = new WeakSet<HTMLElement>();
const showPopover = vi.fn(function (this: HTMLElement) {
  open.add(this);
});
const hidePopover = vi.fn(function (this: HTMLElement) {
  open.delete(this);
});
const matches = HTMLElement.prototype.matches;

beforeEach(() => {
  HTMLElement.prototype.showPopover = showPopover;
  HTMLElement.prototype.hidePopover = hidePopover;
  HTMLElement.prototype.matches = function (this: HTMLElement, sel: string) {
    return sel === ':popover-open' ? open.has(this) : matches.call(this, sel);
  } as typeof matches;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  showPopover.mockClear();
  hidePopover.mockClear();
  HTMLElement.prototype.matches = matches;
});

const tipEl = () => screen.getByRole('tooltip', { hidden: true });

describe('StudioTip', () => {
  it('focus-visible opens the tip and Escape closes it', async () => {
    const user = userEvent.setup();
    render(
      <StudioTip name="Loop">
        <button type="button">go</button>
      </StudioTip>,
    );
    await user.tab();
    expect(open.has(tipEl())).toBe(true);
    await user.keyboard('{Escape}');
    expect(open.has(tipEl())).toBe(false);
  });

  it('moving the pointer from the anchor onto the tip keeps it open', () => {
    vi.useFakeTimers();
    render(
      <StudioTip name="Loop">
        <button type="button">go</button>
      </StudioTip>,
    );
    const anchor = screen.getByRole('button').parentElement as HTMLElement;
    fireEvent.pointerEnter(anchor);
    act(() => void vi.advanceTimersByTime(1000));
    expect(open.has(tipEl())).toBe(true);
    fireEvent.pointerLeave(anchor);
    act(() => void vi.advanceTimersByTime(30));
    fireEvent.pointerEnter(tipEl());
    act(() => void vi.advanceTimersByTime(1000));
    expect(open.has(tipEl())).toBe(true);
    fireEvent.pointerLeave(tipEl());
    act(() => void vi.advanceTimersByTime(1000));
    expect(open.has(tipEl())).toBe(false);
  });
});
