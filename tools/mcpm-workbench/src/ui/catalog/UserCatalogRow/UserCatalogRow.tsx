/** UserCatalogRow — the loaded file as a Data row: on/off, its size and weight range in the ⓘ. */
import type { ReactNode } from 'react';
import { formatWeight } from '../../../utils/format/formatWeight';
import { setUserCatalogOn } from '../../../state/catalog/catalogSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import ToggleRow from '../../panel/ToggleRow/ToggleRow';
import styles from './UserCatalogRow.module.css';

function UserCatalogRow(): ReactNode {
  const dispatch = useAppDispatch();
  const userCatalog = useAppSelector((s) => s.catalog.userCatalog);
  const on = useAppSelector((s) => s.catalog.userCatalogOn);
  if (!userCatalog) return null;
  const { fileName, points, weightStats } = userCatalog;
  return (
    <div className={styles.root} title={fileName}>
      <ToggleRow
        label={fileName}
        on={on}
        onChange={(v) => dispatch(setUserCatalogOn(v))}
        info={
          <>
            {points.count.toLocaleString()} rows
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
