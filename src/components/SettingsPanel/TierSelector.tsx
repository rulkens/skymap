/**
 * TierSelector — three-button segmented control for hot-swapping the data
 * tier (small / medium / large).
 *
 * ### Why a segmented control instead of a dropdown?
 *
 * Three options are the segmented-control sweet spot.  All three tier names
 * stay visible at all times so the user can see "I'm on medium; large costs
 * more" without opening a menu.  Dropdowns would also imply "this is a
 * minor setting"; the tier switcher is the most consequential control on
 * the panel and deserves prominent placement at the top.
 *
 * ### Why aria-pressed and not a radio group?
 *
 * Buttons with `aria-pressed` give us toggle semantics with explicit
 * activation per click, which matches the user mental model (each click
 * triggers a network re-fetch + GPU re-upload).  A radio group's keyboard
 * arrow-navigation would silently fire reloads on every arrow press,
 * which is the wrong cost model for what's behind the button.
 *
 * ### Stateless by design
 *
 * App.tsx owns `tier`; this component only renders the current value and
 * fires `onTierChange` on click.  Same one-way data flow as the rest of
 * SettingsPanel.
 */

import { type ReactNode } from 'react';
import type { Tier } from '../../@types/Tier';
import styles from './TierSelector.module.css';

type Props = {
  /** The currently-active tier — drives which button is `aria-pressed=true`. */
  tier: Tier;
  /** Called with the new tier when the user clicks one of the three buttons. */
  onTierChange: (tier: Tier) => void;
};

/**
 * Per-button labels in the order they render left-to-right.  Ordered
 * smallest → largest so the visual reading matches the data-volume axis.
 */
const TIER_BUTTONS: readonly { tier: Tier; label: string }[] = [
  { tier: 'small', label: 'Small' },
  { tier: 'medium', label: 'Medium' },
  { tier: 'large', label: 'Large' },
];

export function TierSelector({ tier, onTierChange }: Props): ReactNode {
  return (
    <div className={styles.row} role="group" aria-label="Data tier">
      {TIER_BUTTONS.map((b) => {
        const pressed = b.tier === tier;
        return (
          <button
            key={b.tier}
            type="button"
            data-tier={b.tier}
            aria-pressed={pressed}
            className={pressed ? styles.buttonActive : styles.button}
            onClick={() => {
              // Guard against re-firing the change callback when the user
              // clicks the already-active tier — that would trigger a
              // pointless network re-fetch for the same .bin files.
              if (b.tier !== tier) onTierChange(b.tier);
            }}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
