/**
 * UserCatalogRow — the loaded file as a Data row: on/off, its size and weight range in the ⓘ.
 * It takes the row count, never the points: React's dev build walks the props it logs.
 */
import type { ReactNode } from 'react';
import type { WeightStats } from '../../../../@types/catalog/weights/WeightStats';
import { formatWeight } from '../../../utils/format/formatWeight';
import ToggleRow from '../../panel/ToggleRow/ToggleRow';
import styles from './UserCatalogRow.module.css';

export type UserCatalogRowProps = {
  readonly fileName: string;
  readonly rowCount: number;
  readonly weightStats: WeightStats;
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
};

function UserCatalogRow({
  fileName,
  rowCount,
  weightStats,
  on,
  onChange,
}: UserCatalogRowProps): ReactNode {
  return (
    <div className={styles.root} title={fileName}>
      <ToggleRow
        label={fileName}
        on={on}
        onChange={onChange}
        info={
          <>
            {rowCount.toLocaleString()} rows
            <br />
            weights {formatWeight(weightStats.min)} – {formatWeight(weightStats.max)}, median{' '}
            {formatWeight(weightStats.median)}
          </>
        }
      />
    </div>
  );
}

export default UserCatalogRow;
