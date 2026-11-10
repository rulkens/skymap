// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NumberField from '../../../src/primitives/components/NumberField/NumberField';

afterEach(cleanup);

// Stands in for the store: the committed value flows back in as the `value` prop.
function Host({ onCommit }: { onCommit: (v: number, g: string) => void }) {
  const [value, setValue] = useState(2);
  return (
    <NumberField
      label="Duration"
      value={value}
      step={0.5}
      min={0}
      onCommit={(v, g) => {
        setValue(v);
        onCommit(v, g);
      }}
    />
  );
}

function setup() {
  const onCommit = vi.fn();
  const user = userEvent.setup();
  render(<Host onCommit={onCommit} />);
  return {
    onCommit,
    user,
    field: screen.getByRole('textbox', { name: 'Duration' }) as HTMLInputElement,
  };
}

describe('NumberField', () => {
  it('commits the typed value on Enter and reverts on Escape', async () => {
    const { onCommit, user, field } = setup();
    await user.click(field);
    await user.clear(field);
    await user.type(field, '7.5{Enter}');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0]).toBe(7.5);

    await user.clear(field);
    await user.type(field, '9{Escape}');
    expect(field.value).toBe('7.5');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('arrow steps share one gesture id until blur', async () => {
    const { onCommit, user, field } = setup();
    await user.click(field);
    await user.keyboard('{ArrowUp}{ArrowUp}{Shift>}{ArrowDown}{/Shift}');
    const gestures = onCommit.mock.calls.map((c) => c[1]);
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([2.5, 3, 0]);
    expect(new Set(gestures).size).toBe(1);

    await user.tab();
    await user.click(field);
    await user.keyboard('{ArrowUp}');
    expect(onCommit.mock.calls[3]?.[1]).not.toBe(gestures[0]);
  });

  it('keeps unparsable text and marks it invalid without committing', async () => {
    const { onCommit, user, field } = setup();
    await user.click(field);
    await user.clear(field);
    await user.type(field, '1..5{Enter}');
    expect(field.value).toBe('1..5');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a ranged field is the app slider and keyboard steps share one gesture', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(
      <NumberField label="Level" value={0.5} step={0.1} min={0} max={1} onCommit={onCommit} />,
    );
    const slider = screen.getByRole('slider', { name: 'Level' });
    expect(slider).toHaveAttribute('aria-valuemax', '1');
    slider.focus();
    await user.keyboard('{ArrowRight}{End}');
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([0.6, 1]);
    expect(onCommit.mock.calls[0]?.[1]).toBe(onCommit.mock.calls[1]?.[1]);
  });
});
