// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import FullscreenToggleContainer from '../../../src/components/containers/FullscreenToggleContainer';
import { useIsMobile } from '../../../src/hooks/useIsMobile';

vi.mock('../../../src/hooks/useIsMobile', () => ({ useIsMobile: vi.fn<() => boolean>() }));

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

beforeEach(() => vi.mocked(useIsMobile).mockReturnValue(true));
afterEach(() => {
  fullscreenElement = null;
  Reflect.deleteProperty(document, 'fullscreenEnabled');
  Reflect.deleteProperty(document, 'fullscreenElement');
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

  // Entered on a phone, then rotated past the phone breakpoint: the pill is the only exit control.
  it('is a phone feature, but stays while full screen is active at any width', () => {
    stubApi(true);
    vi.mocked(useIsMobile).mockReturnValue(false);
    render(<FullscreenToggleContainer hidden={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    setFullscreen(document.documentElement);
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeInTheDocument();
  });

  it('requests full screen on the root element and swallows a refusal', async () => {
    stubApi(true);
    const request = vi.fn(() => Promise.reject(new Error('denied')));
    document.documentElement.requestFullscreen = request;
    render(<FullscreenToggleContainer hidden={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter full screen' }));
    expect(request).toHaveBeenCalledTimes(1);
    // An unhandled rejection would fail the run here.
    await Promise.resolve();
  });
});
