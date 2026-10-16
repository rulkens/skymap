/**
 * RemotePage — the phone-or-laptop remote: a trackpad that steers the dome's camera, then
 * sections that send named commands. The dome owns all state; this page only renders its latest
 * status, so nothing here is optimistic.
 */

import { useState } from 'react';
import { focusNameFrom } from '../../utils/remote/focusNameFrom';
import { useRemoteLink } from './useRemoteLink';
import JoinField from './JoinField/JoinField';
import Trackpad from './Trackpad/Trackpad';
import SearchSection from './SearchSection/SearchSection';
import TourSection from './TourSection/TourSection';
import ExhibitSection from './ExhibitSection/ExhibitSection';
import TimeSection from './TimeSection/TimeSection';
import ToggleSection from './ToggleSection/ToggleSection';
import controls from './remoteControls.module.css';
import styles from './RemotePage.module.css';

const roomFromHash = (): string | null => location.hash.slice(1) || null;

function RemotePage() {
  const [room, setRoom] = useState(roomFromHash);
  const { status, domeThere, matches, sendCommand, sendDevice, search } = useRemoteLink(room);

  if (!room) {
    return (
      <main className={styles.root}>
        <JoinField onJoin={setRoom} />
      </main>
    );
  }

  const focus = status?.focus
    ? (focusNameFrom(status.focus.id, { searchMatches: matches }) ?? 'Focused')
    : null;
  const link = !domeThere ? 'Dome not there' : status ? 'Connected' : 'Looking for the dome';

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <span role="status" className={domeThere ? styles.link : styles.linkLost}>
          {link}
        </span>
        <span className={styles.focus}>{focus ?? 'Nothing focused'}</span>
      </header>
      <Trackpad onEvent={sendDevice} />
      <div className={styles.homeRow}>
        <button
          type="button"
          className={controls.button}
          onClick={() => sendCommand({ name: 'home', payload: null })}
        >
          Home
        </button>
      </div>
      <SearchSection matches={matches} onSearch={search} onCommand={sendCommand} />
      <TourSection tour={status?.tour ?? null} onCommand={sendCommand} />
      <ExhibitSection onCommand={sendCommand} />
      {status && <TimeSection time={status.time} onCommand={sendCommand} />}
      {status && <ToggleSection toggles={status.toggles} onCommand={sendCommand} />}
    </main>
  );
}

export default RemotePage;
