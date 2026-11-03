/** LibraryTiles — one tile per bottom sheet, in REMOTE_SHEETS order; Search is two columns wide. */

import type { ReactNode } from 'react';
import cx from 'classnames';
import RemoteIcon from '../RemoteIcon/RemoteIcon';
import { REMOTE_SHEETS } from '../../../data/remote/remoteSheets';
import type { RemoteSheetId } from '../../../@types/remote/RemoteSheetId';
import controls from '../remoteControls.module.css';
import styles from './LibraryTiles.module.css';

export type LibraryTilesProps = {
  readonly onOpen: (id: RemoteSheetId, tile: HTMLButtonElement) => void;
};

function LibraryTiles({ onOpen }: LibraryTilesProps): ReactNode {
  return (
    <nav className={styles.root} aria-label="Library">
      {REMOTE_SHEETS.map(({ id, label, glyph }) => (
        <button
          key={id}
          type="button"
          aria-haspopup="dialog"
          className={cx(controls.button, styles.tile, id === 'search' && styles.wide)}
          onClick={(e) => onOpen(id, e.currentTarget)}
        >
          <RemoteIcon glyph={glyph} />
          {label}
        </button>
      ))}
    </nav>
  );
}

export default LibraryTiles;
