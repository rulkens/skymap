// @vitest-environment jsdom
//
// MobileSheet — phone bottom sheet wrapper tests.
//
// The drag is the one gesture the component owns (CSS scroll-snap was dropped:
// iOS Safari won't scroll a pointer-events:none scroller), so we drive it with
// pointer events and assert on the resting state the sheet lands in. jsdom does
// not implement `scrollTo` / `setPointerCapture`, so both are stubbed per test.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import MobileSheet from '../../../src/components/MobileSheet/MobileSheet';

describe('MobileSheet', () => {
  const originalScrollTo = HTMLElement.prototype.scrollTo;
  const originalCapture = HTMLElement.prototype.setPointerCapture;

  beforeEach(() => {
    HTMLElement.prototype.scrollTo = vi.fn() as unknown as typeof HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollTo = originalScrollTo;
    HTMLElement.prototype.setPointerCapture = originalCapture;
  });

  const card = (resetKey = 'galaxy:42') =>
    createElement(MobileSheet, {
      resetKey,
      children: createElement('button', { type: 'button', onClick: onCardButton }, 'card'),
    });
  const onCardButton = vi.fn();
  const sheetOf = (el: HTMLElement) => el.closest('section') as HTMLElement;
  const swipe = (from: HTMLElement, sheet: HTMLElement, dy: number) => {
    fireEvent.pointerDown(from, { pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientY: 500 + dy });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientY: 500 + dy });
  };

  it('swipes up to expand and back down from the handle to the peek', () => {
    const { container } = render(card());
    const sheet = sheetOf(screen.getByText('card'));
    expect(sheet.className).toMatch(/peeking/);

    swipe(screen.getByText('card'), sheet, -120);
    expect(sheet.className).not.toMatch(/peeking/);

    // Expanded, the content scrolls: a drag on it must not collapse the sheet.
    swipe(screen.getByText('card'), sheet, 120);
    expect(sheet.className).not.toMatch(/peeking/);

    swipe(container.querySelector('[class*="handle"]') as HTMLElement, sheet, 120);
    expect(sheet.className).toMatch(/peeking/);
  });

  it('drags an expanded sheet down from a grip-marked header, whose buttons still click', () => {
    const onClose = vi.fn();
    render(
      createElement(MobileSheet, {
        resetKey: 'galaxy:42',
        children: createElement(
          'div',
          { 'data-sheet-grip': '' },
          createElement('button', { type: 'button', onClick: onClose }, 'close'),
        ),
      }),
    );
    const close = screen.getByText('close');
    const sheet = sheetOf(close);
    swipe(close, sheet, -120);
    expect(sheet.className).not.toMatch(/peeking/);

    fireEvent.pointerDown(close, { pointerId: 3, clientY: 500 });
    fireEvent.pointerUp(close, { pointerId: 3, clientY: 501 });
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);

    swipe(close, sheet, 120);
    expect(sheet.className).toMatch(/peeking/);
  });

  // Clearing the offset before the class swap lands lets the sheet jump to its old
  // rest with the transition still off, then animate from there: the flicker.
  it('clears the drag offset no earlier than the rest-state class swap on release', () => {
    render(card());
    const sheet = sheetOf(screen.getByText('card'));
    swipe(screen.getByText('card'), sheet, -120);

    fireEvent.pointerDown(sheet.querySelector('[class*="handle"]') as HTMLElement, {
      pointerId: 1,
      clientY: 500,
    });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientY: 620 });
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(sheet, { attributes: true, attributeFilter: ['class', 'style'] });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientY: 620 });
    records.push(...observer.takeRecords());
    observer.disconnect();
    const order = records.map((r) => r.attributeName);

    expect(sheet.className).toMatch(/peeking/);
    expect(sheet.style.getPropertyValue('--drag')).toBe('');
    expect(order.indexOf('class')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('class')).toBeLessThan(order.indexOf('style'));
  });

  it('springs back on a short drag and lets a tap through as a click', () => {
    render(card());
    const button = screen.getByText('card');
    const sheet = sheetOf(button);

    swipe(button, sheet, -20);
    expect(sheet.className).toMatch(/peeking/);

    onCardButton.mockClear();
    fireEvent.pointerDown(button, { pointerId: 2, clientY: 500 });
    fireEvent.pointerMove(button, { pointerId: 2, clientY: 503 });
    fireEvent.pointerUp(button, { pointerId: 2, clientY: 503 });
    fireEvent.click(button);
    expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalledWith(2);
    expect(onCardButton).toHaveBeenCalledTimes(1);
  });

  it('returns to the peek when resetKey changes', () => {
    const { rerender } = render(card('galaxy:42'));
    const sheet = sheetOf(screen.getByText('card'));
    swipe(screen.getByText('card'), sheet, -120);

    rerender(card('galaxy:42'));
    expect(sheet.className).not.toMatch(/peeking/);

    rerender(card('structure:coma'));
    expect(sheet.className).toMatch(/peeking/);
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('shows a titled close button for panel content and renders the children', () => {
    const onClose = vi.fn();
    render(
      createElement(MobileSheet, {
        resetKey: 'panel:places',
        panel: { title: 'Places', onClose },
        children: createElement('p', null, 'marker'),
      }),
    );
    expect(screen.getByRole('heading', { name: 'Places' })).toBeTruthy();
    expect(screen.getByText('marker')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close Places' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // The panel clips (overflow hidden) so only the body wrapper can scroll long content.
  it('wraps panel content in a scroller under the title row, and never peeks', () => {
    const { container } = render(
      createElement(MobileSheet, {
        resetKey: 'panel:places',
        panel: { title: 'Places', onClose: vi.fn() },
        children: createElement('p', null, 'marker'),
      }),
    );
    expect(screen.getByText('marker').parentElement?.className).toMatch(/body/);
    expect(container.querySelector('[class*="peeking"]')).toBeNull();
  });

  it('has no title row or close button for the selection card', () => {
    render(
      createElement(MobileSheet, {
        resetKey: 'galaxy:42',
        children: createElement('p', null, 'marker'),
      }),
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
