// @vitest-environment jsdom
//
// The typed-value edit mode: right-click or Enter turns the pill into a text
// box; Enter commits, Escape cancels, blur commits a valid value and drops an
// invalid one. Focus has to land back on the pill after Enter/Escape, and keys
// typed in the box must never reach the pill's own slider keys.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Slider from '../../../../src/components/common/Slider/Slider';

afterEach(cleanup);
// jsdom has no Popover API; the reason tip opens itself into the top layer with it.
HTMLElement.prototype.showPopover = function showPopover() {};

function renderSlider(overrides: Partial<Parameters<typeof Slider>[0]> = {}) {
  const onChange = vi.fn<(value: number) => void>();
  render(
    <Slider
      label="Brightness"
      value={1}
      min={0}
      max={4}
      step={0.05}
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange, slider: screen.getByRole('slider') };
}

function openWithEnter(slider: HTMLElement): HTMLInputElement {
  slider.focus();
  fireEvent.keyDown(slider, { key: 'Enter' });
  return screen.getByRole('textbox', { name: 'Brightness' }) as HTMLInputElement;
}

function type(input: HTMLInputElement, text: string): void {
  fireEvent.change(input, { target: { value: text } });
}

describe('Slider typed value', () => {
  it('opens a selected text box on Enter, prefilled with the bare value', () => {
    const { slider } = renderSlider({ value: 2.5, format: (v) => `${v.toFixed(1)}×` });
    const input = openWithEnter(slider);
    expect(input.value).toBe('2.5');
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('opens on right-click and keeps the browser menu off the pill', () => {
    const { slider } = renderSlider();
    const notPrevented = fireEvent.contextMenu(slider);
    expect(notPrevented).toBe(false);
    expect(screen.getByRole('textbox', { name: 'Brightness' })).toBeTruthy();
  });

  it('prefills every digit of the value, not the rounded display', () => {
    const { slider } = renderSlider({ value: 0.123456, format: (v) => `${v.toFixed(1)} Mpc` });
    expect(openWithEnter(slider).value).toBe('0.123456');
  });

  it('commits once on Enter and hands focus back to the pill', () => {
    const { slider, onChange } = renderSlider();
    const input = openWithEnter(slider);
    type(input, '2.5');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(2.5);
    const back = screen.getByRole('slider');
    expect(document.activeElement).toBe(back);
  });

  it('snaps a typed value to the step grid, as integer-stepped consumers need', () => {
    const { slider, onChange } = renderSlider({ value: 2, min: 1, max: 8, step: 1 });
    const input = openWithEnter(slider);
    type(input, '4.4');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('marks out-of-range and non-numbers invalid on Enter and stays open', () => {
    for (const text of ['9', 'abc']) {
      const { slider, onChange } = renderSlider();
      const input = openWithEnter(slider);
      type(input, text);
      expect(input.getAttribute('aria-invalid')).toBeNull();
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByRole('textbox')).toBe(input);
      type(input, '3');
      expect(input.getAttribute('aria-invalid')).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('cancels on Escape without committing or letting the key reach a parent', () => {
    const onParentKey = vi.fn();
    const onDocumentKey = vi.fn();
    document.addEventListener('keydown', onDocumentKey);
    const onChange = vi.fn<(value: number) => void>();
    render(
      <div onKeyDown={onParentKey}>
        <Slider label="Brightness" value={1} min={0} max={4} onChange={onChange} />
      </div>,
    );
    const input = openWithEnter(screen.getByRole('slider'));
    onParentKey.mockClear();
    onDocumentKey.mockClear();
    type(input, '3');
    fireEvent.keyDown(input, { key: 'Escape' });
    document.removeEventListener('keydown', onDocumentKey);
    expect(onChange).not.toHaveBeenCalled();
    expect(onParentKey).not.toHaveBeenCalled();
    expect(onDocumentKey).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('slider'));
  });

  it('commits a valid value on blur and drops an invalid one', () => {
    const { slider, onChange } = renderSlider();
    let input = openWithEnter(slider);
    type(input, '3');
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(3);

    input = openWithEnter(screen.getByRole('slider'));
    type(input, '12');
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps caret keys inside the box from moving the slider', () => {
    const { slider, onChange } = renderSlider();
    const input = openWithEnter(slider);
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) fireEvent.keyDown(input, { key });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('drags on the primary button only', () => {
    const { slider, onChange } = renderSlider();
    slider.setPointerCapture = () => {};
    slider.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    fireEvent.pointerDown(slider, { button: 2, clientX: 50, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(slider, { button: 0, clientX: 50, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('never opens the text box when disabled', () => {
    const { slider } = renderSlider({ disabled: true });
    fireEvent.keyDown(slider, { key: 'Enter' });
    fireEvent.contextMenu(slider);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('Slider typed in the units it shows', () => {
  // Stored log10, shown 10^v: the shape of the workbench's log sliders.
  const logScale = {
    fromValue: (v: number) => 10 ** v,
    toValue: (shown: number) => Math.log10(shown),
  };
  const renderLog = (value: number) =>
    renderSlider({ value, min: -3, max: 3, step: 0.1, displayed: logScale });

  it('prefills the shown number and stores what was typed in shown units', () => {
    const { slider, onChange } = renderLog(-1);
    const input = openWithEnter(slider);
    expect(input.value).toBe('0.1');
    type(input, '100');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('takes the shown range as the valid typed range', () => {
    for (const text of ['1e4', '0.0001', '0', '-5']) {
      const { slider, onChange } = renderLog(0);
      const input = openWithEnter(slider);
      type(input, text);
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(input.getAttribute('aria-invalid'), text).toBe('true');
      expect(onChange).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('sends nothing on Enter when the shown number was not edited', () => {
    // 10^0.3 does not convert back to exactly 0.3, so only the text tells it was untouched.
    const { slider, onChange } = renderLog(0.3);
    fireEvent.keyDown(openWithEnter(slider), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Slider says why a typed value is invalid', () => {
  // `hidden`: jsdom keeps a popover display:none, as the stubbed showPopover never opens it.
  const reason = () => screen.queryByRole('alert', { hidden: true });

  it('shows no reason while typing, before the first failed Enter', () => {
    const { slider } = renderSlider();
    const input = openWithEnter(slider);
    type(input, '9');
    expect(reason()).toBeNull();
  });

  it('says "Not a number" after a failed Enter, as the box description', () => {
    const { slider } = renderSlider();
    const input = openWithEnter(slider);
    type(input, 'abc');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(reason()?.textContent).toBe('Not a number');
    expect(input.getAttribute('aria-describedby')).toBe(reason()?.id);
  });

  it('gives the range for a value out of it, and goes once the text is valid', () => {
    const { slider } = renderSlider();
    const input = openWithEnter(slider);
    type(input, '9');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(reason()?.textContent).toBe('Between 0 and 4');
    type(input, '-');
    expect(reason()?.textContent).toBe('Not a number');
    type(input, '3');
    expect(reason()).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('gives the range in the units the pill shows', () => {
    const { slider } = renderSlider({
      value: 0,
      min: -3,
      max: 3,
      step: 0.1,
      displayed: { fromValue: (v) => 10 ** v, toValue: (shown) => Math.log10(shown) },
    });
    const input = openWithEnter(slider);
    type(input, '5000');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(reason()?.textContent).toBe('Between 0.001 and 1000');
  });

  it('goes away on Escape', () => {
    const { slider } = renderSlider();
    const input = openWithEnter(slider);
    type(input, 'abc');
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(reason()).toBeNull();
  });
});
