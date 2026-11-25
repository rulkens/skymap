/** UserCatalogRow — the loaded file as a Data row: on/off, with its size and weight range under it. */
import type { ReactNode } from 'react';
import { formatWeight } from '../../field/formatWeight';
import { setUserCatalogOn } from '../../state/catalog/catalogSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import PanelRow from '../PanelRow/PanelRow';
import ToggleRow from '../ToggleRow/ToggleRow';
import styles from './UserCatalogRow.module.css';

function UserCatalogRow(): ReactNode {
  const dispatch = useAppDispatch();
  const userCatalog = useAppSelector((s) => s.catalog.userCatalog);
  const on = useAppSelector((s) => s.catalog.userCatalogOn);
  if (!userCatalog) return null;
  const { fileName, points, weightStats } = userCatalog;
  return (
    <div className={styles.root} title={fileName}>
      <ToggleRow label={fileName} on={on} onChange={(v) => dispatch(setUserCatalogOn(v))} />
      <PanelRow>
        <p className={styles.detail}>
          {points.count.toLocaleString()} rows
          <br />
          weights {formatWeight(weightStats.min)} – {formatWeight(weightStats.max)}, median{' '}
          {formatWeight(weightStats.median)}
        </p>
      </PanelRow>
    </div>
  );
}

export default UserCatalogRow;
