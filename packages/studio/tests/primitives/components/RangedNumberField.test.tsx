// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RangedNumberField from '../../../src/primitives/components/RangedNumberField/RangedNumberField';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RangedNumberField', () => {
  it('commits under 600 ms apart share a gesture; a longer pause starts a new one', () => {
    const now = vi.spyOn(performance, 'now');
    const onCommit = vi.fn();
    render(
      <RangedNumberField
        label="Level"
        value={0.5}
        step={0.1}
        min={0}
        max={1}
        onCommit={onCommit}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Level' });

    for (const at of [1000, 1500, 2050, 2700]) {
      now.mockReturnValue(at);
      fireEvent.keyDown(slider, { key: 'ArrowRight' });
    }

    const [a, b, c, d] = onCommit.mock.calls.map((call) => call[1]);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(d).not.toBe(a);
  });
});
