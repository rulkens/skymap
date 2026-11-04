/**
 * NetworkChoice — which network the pairing address uses. Hidden with one network or none: there is
 * nothing to pick. Unpicked, it shows the first, which is what the address then uses.
 */

import type { ReactNode } from 'react';
import type { LanInterface } from '../../../@types/LanInterface';
import chrome from '../controlChrome.module.css';
import styles from './NetworkChoice.module.css';

export type NetworkChoiceProps = {
  readonly networks: readonly LanInterface[];
  readonly network: string | null;
  readonly onPick: (network: string) => void;
};

function NetworkChoice({ networks, network, onPick }: NetworkChoiceProps): ReactNode {
  if (networks.length < 2) return null;
  return (
    <label className={styles.root}>
      Network the tablets use
      <select
        className={chrome.control}
        value={network ?? networks[0]?.name}
        onChange={(e) => onPick(e.target.value)}
      >
        {networks.map(({ name, address }) => (
          <option key={name} value={name}>
            {name} · {address}
          </option>
        ))}
      </select>
    </label>
  );
}

export default NetworkChoice;
