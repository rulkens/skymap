/**
 * VersionNotice — the dome answers at another protocol version: which page needs a reload. The
 * phone cannot reload the dome, so only the remote's own reload gets a button.
 */

import type { ReactNode } from 'react';
import type { DomeLinkState } from '../../../@types/remote/DomeLinkState';
import controls from '../remoteControls.module.css';

export type VersionNoticeProps = {
  readonly state: Extract<DomeLinkState, 'domeOlder' | 'domeNewer'>;
};

const TEXT = {
  domeOlder:
    "The dome runs an older Skymap than this remote. Reload the dome's page, then scan its new code.",
  domeNewer: 'This remote runs an older Skymap than the dome. Reload this page.',
} as const;

function VersionNotice({ state }: VersionNoticeProps): ReactNode {
  return (
    <div role="alert" className={controls.notice}>
      <p className={controls.noticeText}>{TEXT[state]}</p>
      {state === 'domeNewer' && (
        <button type="button" className={controls.button} onClick={() => location.reload()}>
          Reload page
        </button>
      )}
    </div>
  );
}

export default VersionNotice;
