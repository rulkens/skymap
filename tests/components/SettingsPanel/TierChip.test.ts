// @vitest-environment jsdom
/**
 * Tests for TierChip.
 *
 * TierChip is the compact tier dropdown that lives in the panel header
 * strip via the `Panel.headerExtra` slot.
 *
 * The native <select> handles keyboard nav / a11y / popup chrome on
 * its own; we just verify the contract this component owns: the
 * current tier maps to the select's value, and onChange fires with
 * the picked tier.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { TierChip } from '../../../src/components/SettingsPanel/TierChip';

describe('TierChip', () => {
  it('renders a combobox seeded with the current tier', () => {
    render(
      createElement(TierChip, { tier: 'medium', onTierChange: () => {} }),
    );
    const select = screen.getByRole('combobox', { name: /data tier/i });
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe('medium');
  });

  it('fires onTierChange with the picked tier', async () => {
    const onTierChange = vi.fn();
    const user = userEvent.setup();
    render(
      createElement(TierChip, { tier: 'small', onTierChange }),
    );
    const select = screen.getByRole('combobox', { name: /data tier/i });
    await user.selectOptions(select, 'large');
    expect(onTierChange).toHaveBeenCalledOnce();
    expect(onTierChange).toHaveBeenCalledWith('large');
  });

  // Native <select> doesn't fire onChange when the user re-picks the
  // already-selected option, so no explicit guard against pointless
  // re-fetches is needed — the browser handles it.  No test for that
  // behaviour since it's a platform invariant, not this component's
  // responsibility.
});
