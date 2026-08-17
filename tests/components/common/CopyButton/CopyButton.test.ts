// @vitest-environment jsdom
//
// CopyButton owns three pieces of real, observable behaviour: the
// disabled-when-empty branch, the success/failure feedback swap driven by
// the clipboard promise, and the timer that reverts the feedback (cleared on
// unmount so it can't fire a state update after the DebugPanel section that
// hosts it collapses). Chrome (border, hover) comes from the shared Button
// primitive and is covered by Button's own contract, not re-tested here.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createElement } from 'react';
import CopyButton from '../../../../src/components/common/CopyButton/CopyButton';

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  });
}

describe('CopyButton', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('disables the button when text is empty', () => {
    render(createElement(CopyButton, { text: '', label: 'Copy' }));
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });

  it('copies the given text and shows success feedback', async () => {
    stubClipboard(() => Promise.resolve());
    render(createElement(CopyButton, { text: 'starCount: 200000,', label: 'Copy' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('starCount: 200000,');
    expect(screen.getByRole('button')).toHaveTextContent('copied ✓');
  });

  it('shows failure feedback when the clipboard write rejects', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    render(createElement(CopyButton, { text: 'x', label: 'Copy' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('button')).toHaveTextContent('failed');
  });

  it('reverts to the idle label after the feedback window elapses', async () => {
    vi.useFakeTimers();
    stubClipboard(() => Promise.resolve());
    render(createElement(CopyButton, { text: 'x', label: 'Copy' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await Promise.resolve();
    });
    expect(screen.getByRole('button')).toHaveTextContent('copied ✓');
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.getByRole('button')).toHaveTextContent('Copy');
  });

  it('clears the pending feedback timer on unmount', async () => {
    stubClipboard(() => Promise.resolve());
    const setSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = render(createElement(CopyButton, { text: 'x', label: 'Copy' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await Promise.resolve();
    });
    const scheduledId = setSpy.mock.results[setSpy.mock.results.length - 1]!.value;
    unmount();
    expect(clearSpy).toHaveBeenCalledWith(scheduledId);
  });
});
