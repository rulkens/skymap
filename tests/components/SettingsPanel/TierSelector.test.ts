// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { TierSelector } from '../../../src/components/SettingsPanel/TierSelector';

describe('TierSelector', () => {
  it('marks the active tier with aria-pressed=true and the others false', () => {
    render(
      createElement(TierSelector, { tier: 'medium', onTierChange: () => {} }),
    );
    expect(
      screen.getByRole('button', { name: /medium/i, pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /small/i, pressed: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /large/i, pressed: false }),
    ).toBeInTheDocument();
  });

  it('fires onTierChange with the clicked tier', async () => {
    const onTierChange = vi.fn();
    const user = userEvent.setup();
    render(
      createElement(TierSelector, { tier: 'small', onTierChange }),
    );
    await user.click(screen.getByRole('button', { name: /large/i }));
    expect(onTierChange).toHaveBeenCalledOnce();
    expect(onTierChange).toHaveBeenCalledWith('large');
  });

  it('does not fire onTierChange when the active tier is re-clicked', async () => {
    // The component guards against pointless re-fetches by short-circuiting
    // when the click target matches the current tier.
    const onTierChange = vi.fn();
    const user = userEvent.setup();
    render(
      createElement(TierSelector, { tier: 'medium', onTierChange }),
    );
    await user.click(screen.getByRole('button', { name: /medium/i }));
    expect(onTierChange).not.toHaveBeenCalled();
  });

  // Arrow-key segmented-control nav was considered but skipped — the
  // component intentionally uses aria-pressed (toggle-button) semantics
  // rather than a radio group, precisely so arrow keys don't silently
  // trigger re-fetches per arrow press.  See the docblock at the top of
  // TierSelector.tsx for the cost-model rationale.
});
