// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { useFullscreen } from '../../src/hooks/useFullscreen';
import FullscreenToggleContainer from '../../src/components/containers/FullscreenToggleContainer';

// jsdom has no Fullscreen API: stand in for the two document properties the hook reads.
let fullscreenElement: Element | null = null;
function stubApi(enabled: boolean): void {
  Object.defineProperty(document, 'fullscreenEnabled', { value: enabled, configurable: true });
  Object.defineProperty(document, 'fullscreenElement', {
    get: () => fullscreenElement,
    configurable: true,
  });
}
function setFullscreen(el: Element | null): void {
  act(() => {
    fullscreenElement = el;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
}

afterEach(() => {
  fullscreenElement = null;
  Reflect.deleteProperty(document, 'fullscreenEnabled');
  Reflect.deleteProperty(document, 'fullscreenElement');
});

describe('useFullscreen', () => {
  // The state must come from the browser: Escape or a system gesture leaves full screen without any tap.
  it('follows fullscreenchange rather than its own toggle', () => {
    stubApi(true);
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.active).toBe(false);
    setFullscreen(document.documentElement);
    expect(result.current.active).toBe(true);
    setFullscreen(null);
    expect(result.current.active).toBe(false);
  });

  it('requests full screen on the root element and swallows a refusal', async () => {
    stubApi(true);
    const request = vi.fn(() => Promise.reject(new Error('denied')));
    document.documentElement.requestFullscreen = request;
    const { result } = renderHook(() => useFullscreen());
    act(() => result.current.toggle());
    expect(request).toHaveBeenCalledTimes(1);
    // An unhandled rejection would fail the run here.
    await Promise.resolve();
  });
});

describe('FullscreenToggleContainer', () => {
  it('renders no button where the API is unavailable', () => {
    stubApi(false);
    const { container } = render(<FullscreenToggleContainer hidden={false} />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('labels the pill by what a tap will do and presses it while active', () => {
    stubApi(true);
    render(<FullscreenToggleContainer hidden={false} />);
    expect(screen.getByRole('button', { name: 'Enter full screen' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    setFullscreen(document.documentElement);
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
