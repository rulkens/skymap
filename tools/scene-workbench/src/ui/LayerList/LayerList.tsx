/**
 * LayerList — one row per asset in the selected group's manifest: a
 * visibility checkbox, a kind badge, the point count, and the load status.
 * The count stays visible while hidden — a bake that produced a tenth of
 * what it should have is visible at a glance regardless of the toggle.
 */
import type { ReactNode } from 'react';

import { toggleAssetVisibility } from '../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import styles from './LayerList.module.css';

function LayerList(): ReactNode {
  const dispatch = useAppDispatch();
  const manifest = useAppSelector((state) => state.group.manifest);
  const assetStatus = useAppSelector((state) => state.group.assetStatus);
  const hiddenAssetIds = useAppSelector((state) => state.view.hiddenAssetIds);

  if (!manifest || manifest.assets.length === 0) return null;

  return (
    <ul className={styles.root}>
      {manifest.assets.map((asset) => {
        const hidden = hiddenAssetIds.includes(asset.id);
        return (
          <li key={asset.id} className={styles.row}>
            <label className={styles.toggleLabel}>
              <span className={styles.assetLabel}>{asset.label}</span>
              <input
                type="checkbox"
                className={styles.checkbox}
                aria-label={asset.label}
                checked={!hidden}
                onChange={() => dispatch(toggleAssetVisibility(asset.id))}
              />
            </label>
            <div className={styles.meta}>
              <span className={styles.badge}>{asset.kind}</span>
              <span className={styles.count}>{asset.pointCount.toLocaleString()} pts</span>
              <span className={styles.status}>{assetStatus[asset.id] ?? 'pending'}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default LayerList;
