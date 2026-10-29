// @vitest-environment jsdom

/**
 * SatellitesSection — plain props, no store: each class switch reflects and writes its own class,
 * and the master reads "mixed" only while it is on with some class off.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import SatellitesSection from '../../../../src/layers/satellites/ui/SatellitesSection';
import type { SatelliteClass } from '../../../../src/@types/satellites/SatelliteClass';

const items = (debris: boolean) => ({
  active: { enabled: true },
  debris: { enabled: debris },
  other: { enabled: true },
});
const props = (over: Partial<Parameters<typeof SatellitesSection>[0]> = {}) => ({
  enabled: true,
  items: items(true),
  onToggleMaster: vi.fn<(on: boolean) => void>(),
  onToggleClass: vi.fn<(cls: SatelliteClass, on: boolean) => void>(),
  ...over,
});
const master = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;

describe('SatellitesSection', () => {
  it('switches one class off without touching the others', () => {
    const onToggleClass = vi.fn<(cls: SatelliteClass, on: boolean) => void>();
    const { container } = render(createElement(SatellitesSection, props({ onToggleClass })));
    const debris = container.querySelector<HTMLInputElement>('#toggle-satellite-class-debris')!;
    expect(debris.checked).toBe(true);
    fireEvent.click(debris);
    expect(onToggleClass).toHaveBeenCalledExactlyOnceWith('debris', false);
  });

  it('shows the master as mixed while it is on and a class is off', () => {
    const { container, rerender } = render(createElement(SatellitesSection, props()));
    expect(master(container).indeterminate).toBe(false);
    rerender(createElement(SatellitesSection, props({ items: items(false) })));
    expect(master(container).indeterminate).toBe(true);
    rerender(createElement(SatellitesSection, props({ enabled: false, items: items(false) })));
    expect(master(container).indeterminate).toBe(false);
  });
});
