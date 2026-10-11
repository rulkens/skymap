// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Dock from '../../../src/components/Dock/Dock';
import type { DockProps } from '../../../src/components/Dock/Dock';

function renderDock(overrides: Partial<DockProps> = {}) {
  const props: DockProps = {
    timeOpen: false,
    layersOpen: false,
    timeLabel: { text: 'Time', glyph: null },
    onTime: vi.fn<() => void>(),
    onLayers: vi.fn<() => void>(),
    ...overrides,
  };
  render(<Dock {...props} />);
  return props;
}

describe('Dock', () => {
  // Near-identical items: the bug to catch is one wired to its neighbour's flag or handler.
  it('marks only the open item as pressed and routes each tap to its own handler', () => {
    const props = renderDock({ layersOpen: true });
    const time = screen.getByRole('button', { name: 'Time' });
    const layers = screen.getByRole('button', { name: 'Layers' });

    expect(time).toHaveAttribute('aria-pressed', 'false');
    expect(layers).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(time);
    expect(props.onTime).toHaveBeenCalledTimes(1);
    expect(props.onLayers).not.toHaveBeenCalled();
  });

  it('names the Time item by its date when the clock is off real time, glyph kept out of the name', () => {
    renderDock({ timeLabel: { text: '22 Oct 2026', glyph: '❚❚' } });
    const time = screen.getByRole('button', { name: '22 Oct 2026' });
    expect(time).toHaveTextContent('22 Oct 2026 ❚❚');
    expect(screen.queryByRole('button', { name: 'Time' })).toBeNull();
  });
});
