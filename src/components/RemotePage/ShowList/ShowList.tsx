/**
 * ShowList — the Tours, Exhibits or Clips sheet: one row per menu item, the running one marked.
 * Exhibits and clips can share an id, so "running" matches on kind as well as id.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import RemoteIcon from '../RemoteIcon/RemoteIcon';
import { REMOTE_SHOW_KINDS } from '../../../data/remote/remoteShowKinds';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import type { RemoteMenu } from '../../../@types/remote/RemoteMenu';
import type { RemoteMenuItem } from '../../../@types/remote/RemoteMenuItem';
import type { RemoteTakeover } from '../../../@types/remote/RemoteTakeover';
import controls from '../remoteControls.module.css';
import styles from './ShowList.module.css';

export type ShowListProps = {
  readonly kind: RemoteTakeover['kind'];
  readonly menu: RemoteMenu | null;
  readonly takeover: RemoteTakeover | null;
  readonly onCommand: (command: RemoteCommand) => void;
};

function ShowList({ kind, menu, takeover, onCommand }: ShowListProps): ReactNode {
  if (!menu) return <p className={styles.waiting}>Waiting for the dome's lists</p>;
  const { list, glyph, start } = REMOTE_SHOW_KINDS[kind];
  // Each row's id comes from this kind's own list, so it is the id `start` takes; the union of the
  // three kinds hides that from the compiler.
  const items: readonly RemoteMenuItem<string>[] = menu[list];
  const startItem = start as (id: string) => RemoteCommand;
  return (
    <ul className={controls.rows}>
      {items.map(({ id, label }) => {
        const running = takeover?.kind === kind && takeover.id === id;
        return (
          <li key={id}>
            <button
              type="button"
              aria-current={running || undefined}
              className={cx(controls.button, controls.row, styles.row, running && controls.on)}
              onClick={() => onCommand(startItem(id))}
            >
              <RemoteIcon glyph={glyph} />
              <span className={controls.grow}>{label}</span>
              <RemoteIcon glyph="play" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default ShowList;
