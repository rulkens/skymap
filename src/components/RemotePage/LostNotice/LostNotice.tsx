/** LostNotice — the dome stopped answering: which code this page is on, and the way to change it. */

import type { ReactNode } from 'react';
import controls from '../remoteControls.module.css';
import styles from './LostNotice.module.css';

export type LostNoticeProps = {
  readonly room: string;
  readonly onChangeCode: () => void;
};

function LostNotice({ room, onChangeCode }: LostNoticeProps): ReactNode {
  return (
    <div role="alert" className={styles.root}>
      <p className={styles.text}>
        No answer on room <span className={styles.code}>{room}</span>. Check the code the dome
        shows.
      </p>
      <button type="button" className={controls.button} onClick={onChangeCode}>
        Change code
      </button>
    </div>
  );
}

export default LostNotice;
