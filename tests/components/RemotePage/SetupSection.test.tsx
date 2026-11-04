// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SetupSection from '../../../src/components/RemotePage/SetupSection/SetupSection';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'standalone');
});

describe('SetupSection', () => {
  // Only iOS defines navigator.standalone; undefined is every other browser.
  it.each([
    ['an iPhone tab', false, true],
    ['another browser', undefined, false],
    ['the Home Screen app', true, false],
  ])('in %s (standalone %s) the full-screen hint shows: %s', (_where, standalone, shown) => {
    if (standalone !== undefined) {
      Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true });
    }
    render(<SetupSection onAddPhone={() => {}} redLight={false} onRedLight={() => {}} />);
    expect(screen.queryByText(/Add to Home Screen/) !== null).toBe(shown);
  });
});
