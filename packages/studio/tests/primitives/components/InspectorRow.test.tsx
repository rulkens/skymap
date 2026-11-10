// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InspectorRow from '../../../src/primitives/components/InspectorRow/InspectorRow';

afterEach(cleanup);

describe('InspectorRow', () => {
  it('reset calls onReset and is labelled for its field', async () => {
    const onReset = vi.fn();
    render(
      <InspectorRow label="Duration" unit="s" onReset={onReset}>
        <input aria-label="Duration" />
      </InspectorRow>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reset Duration to default' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
