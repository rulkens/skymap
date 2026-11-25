/**
 * TierRow — the built-in catalogs' data tier as a panel row: "tier" on the
 * content edge, the dropdown on the control track. The app's `TierChip` carries
 * its own "Tier" caption, which would repeat the row label here.
 */
import type { ReactNode } from 'react';
import type { Tier } from '../../../../../src/@types/data/Tier';
import { TIER_LADDER } from '../../../../../src/data/tierLadder';
import PanelRow from '../PanelRow/PanelRow';
import styles from './TierRow.module.css';

export type TierRowProps = {
  readonly tier: Tier;
  readonly onChange: (tier: Tier) => void;
};

function TierRow({ tier, onChange }: TierRowProps): ReactNode {
  return (
    <PanelRow
      label="tier"
      info="How many galaxies each built-in catalog brings: small and medium keep the brightest, large is the whole catalog."
    >
      <select
        className={styles.select}
        value={tier}
        onChange={(e) => onChange(e.target.value as Tier)}
      >
        {TIER_LADDER.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </PanelRow>
  );
}

export default TierRow;
