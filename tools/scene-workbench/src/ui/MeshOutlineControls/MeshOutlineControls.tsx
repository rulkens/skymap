/**
 * MeshOutlineControls — a mesh row's outline affordances: enter draw mode and toggle the saved
 * mask, or, while this mesh's draft is open, its corner count and Save / Discard. Save waits for
 * a closed ring because the endpoint rejects anything else.
 */
import type { ReactNode } from 'react';

import Button from '../../../../../src/components/common/Button/Button';
import {
  drawOutlineRequested,
  outlineDiscardRequested,
  outlineSaveRequested,
} from '../../state/commands';
import { maskToggled } from '../../state/outline/outlineSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import styles from './MeshOutlineControls.module.css';

export type MeshOutlineControlsProps = {
  readonly assetId: string;
};

function MeshOutlineControls({ assetId }: MeshOutlineControlsProps): ReactNode {
  const dispatch = useAppDispatch();
  const draft = useAppSelector((state) => state.outline.draft);
  const saved = useAppSelector((state) => state.outline.byAssetId[assetId]);
  const saveError = useAppSelector((state) => state.outline.saveError);

  if (draft?.assetId === assetId) {
    return (
      <div className={styles.root}>
        <span className={styles.readout}>{draft.ringM.length} corners</span>
        <Button disabled={!draft.closed} onClick={() => dispatch(outlineSaveRequested())}>
          Save
        </Button>
        <Button onClick={() => dispatch(outlineDiscardRequested())}>Discard</Button>
        {saveError && <span className={styles.error}>{saveError}</span>}
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <Button disabled={draft !== null} onClick={() => dispatch(drawOutlineRequested(assetId))}>
        {saved ? 'Edit outline' : 'Draw outline'}
      </Button>
      {saved && (
        <label className={styles.toggleLabel}>
          Mask
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={saved.masked}
            onChange={() => dispatch(maskToggled(assetId))}
          />
        </label>
      )}
    </div>
  );
}

export default MeshOutlineControls;
