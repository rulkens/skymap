/**
 * TierChip — compact dropdown for the data tier, rendered in the
 * Settings panel's title strip (via `Panel.headerExtra`).
 *
 * ### Why a chip, not a segmented row
 *
 * The 2026-05-19 UX audit (Q13 + converged structure) kept the tier
 * control always-visible — it's the most consequential decision the
 * user makes — but reclaimed the full panel-body row it used to eat
 * for a three-button segmented control (`TierSelector`).  The header
 * strip had unused real estate next to the "Settings" title; the chip
 * fills it without growing the panel vertically.
 *
 * ### Why a native `<select>`
 *
 * Native `<select>` gets us keyboard navigation, screen-reader
 * announcements, mobile native picker UX, and option-list virtualisation
 * for free.  A bespoke React dropdown would re-invent each of those
 * with a high failure surface for a control the user touches maybe
 * once per session.  CSS-Modules styling skins the surface to match
 * the panel's chrome (border-control, surface-control, focus-ring) so
 * the chip reads as part of the header rather than a foreign element.
 *
 * ### Why not aria-pressed (TierSelector's approach)
 *
 * The segmented control used `aria-pressed` with toggle semantics so
 * every click was an explicit "I want to reload at this tier" choice.
 * The chip's `<select>` already conveys "pick one of these"; the
 * onChange handler still no-ops when the user re-picks the active tier,
 * preserving the cost-model carefulness without the parallel ARIA
 * idiom.
 *
 * ### Stateless by design
 *
 * Same pattern as TierSelector: App.tsx owns `tier`, this component
 * reflects it and emits `onTierChange` on selection.
 */

import { type ReactNode } from 'react';
import type { Tier } from '../../@types/data/Tier';
import styles from './TierChip.module.css';

type Props = {
  /** The currently-active tier — drives the `<select>`'s value. */
  tier: Tier;
  /** Called with the new tier when the user picks a different option. */
  onTierChange: (tier: Tier) => void;
};

/**
 * Ordered smallest → largest so the visual reading order matches the
 * data-volume axis the explorer is mentally scanning when they pick.
 */
const TIER_OPTIONS: readonly { tier: Tier; label: string }[] = [
  { tier: 'small', label: 'Small' },
  { tier: 'medium', label: 'Medium' },
  { tier: 'large', label: 'Large' },
];

export function TierChip({ tier, onTierChange }: Props): ReactNode {
  return (
    <label className={styles.chip} aria-label="Data tier">
      {/*
        The static "Tier" caption inside the chip orients new users
        before they open the dropdown.  Once they know what the chip
        means, the caption costs near-zero attention.  Marking it
        aria-hidden because the outer <label>'s aria-label already
        carries the field name for assistive tech.
      */}
      <span className={styles.caption} aria-hidden="true">
        Tier
      </span>
      <select
        className={styles.select}
        value={tier}
        onChange={(e) => {
          const next = e.target.value as Tier;
          // Guard against re-firing for the same value — picking the
          // already-active tier would trigger a pointless network
          // re-fetch + GPU re-upload, same hazard TierSelector guards.
          if (next !== tier) onTierChange(next);
        }}
      >
        {TIER_OPTIONS.map((o) => (
          <option key={o.tier} value={o.tier}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
