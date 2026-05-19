// @vitest-environment jsdom
/**
 * Tests for TierChip.
 *
 * TierChip is the compact dropdown that replaced the three-button
 * TierSelector during the 2026-05-19 SettingsPanel UX restructure
 * (see `docs/grill-sessions/settings-panel-audit-2026-05-19.md`).
 * It now lives in the panel header strip via the new
 * `Panel.headerExtra` slot.
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

  it('exposes small / medium / large as the three options', () => {
    render(
      createElement(TierChip, { tier: 'small', onTierChange: () => {} }),
    );
    const select = screen.getByRole('combobox', { name: /data tier/i }) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['small', 'medium', 'large']);
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
  // already-selected option, so the old TierSelector's explicit guard
  // against pointless re-fetches isn't needed here — the browser
  // handles it for us.  No test for that behaviour since it's a
  // platform invariant, not this component's responsibility.
});
