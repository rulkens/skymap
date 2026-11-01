/**
 * RemotePage — the phone-or-laptop remote: a trackpad that steers the dome's camera, then
 * sections that send named commands. The dome owns all state; this page only renders its latest
 * status, so nothing here is optimistic, and the sections that need the dome wait for it.
 */

import { useEffect, useState } from 'react';
import cx from 'classnames';
import { focusNameFrom } from '../../utils/remote/focusNameFrom';
import { useRemoteLink } from './useRemoteLink';
import JoinField from './JoinField/JoinField';
import LinkStatus from './LinkStatus/LinkStatus';
import LostNotice from './LostNotice/LostNotice';
import AxisHoldButtons from './AxisHoldButtons/AxisHoldButtons';
import Trackpad from './Trackpad/Trackpad';
import SearchSection from './SearchSection/SearchSection';
import TourSection from './TourSection/TourSection';
import ExhibitSection from './ExhibitSection/ExhibitSection';
import TimeSection from './TimeSection/TimeSection';
import ToggleSection from './ToggleSection/ToggleSection';
import SetupSection from './SetupSection/SetupSection';
import HomeIcon from './HomeIcon';
import SchemeSwitch from './SchemeSwitch/SchemeSwitch';
import type { RemoteNavAxis } from '../../@types/remote/RemoteNavAxis';
import controls from './remoteControls.module.css';
import styles from './RemotePage.module.css';

const roomFromHash = (): string | null => location.hash.slice(1) || null;

function RemotePage() {
  const [room, setRoom] = useState(roomFromHash);
  const { status, domeThere, menu, matches, sendCommand, sendDevice, search } = useRemoteLink(room);
  const [axis, setAxis] = useState<RemoteNavAxis>('orbit');
  const scheme = status?.controls.scheme;
  const openspace = scheme === 'openspace';
  useEffect(() => {
    if (!openspace) setAxis('orbit');
  }, [openspace]);
  // The code lives in the address so a reload rejoins: iOS reloads a tab it evicted from memory.
  const join = (code: string | null): void => {
    location.hash = code ?? '';
    setRoom(code);
  };

  if (!room) {
    return (
      <main className={styles.root}>
        <JoinField onJoin={join} />
      </main>
    );
  }

  const focus = status?.focus ? (focusNameFrom(status.focus.id, matches) ?? 'Focused') : null;

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <LinkStatus state={!domeThere ? 'lost' : status ? 'connected' : 'looking'} />
        {status && domeThere && <span className={styles.focus}>{focus ?? 'Nothing focused'}</span>}
      </header>
      {!domeThere && <LostNotice room={room} onChangeCode={() => join(null)} />}
      <div className={styles.steer}>
        <Trackpad onEvent={sendDevice} axis={openspace ? axis : null}>
          {openspace && <AxisHoldButtons axis={axis} onChange={setAxis} />}
        </Trackpad>
        <div className={styles.homeRow}>
          <button
            type="button"
            className={cx(controls.button, styles.home)}
            onClick={() => sendCommand({ name: 'home', payload: null })}
          >
            <HomeIcon />
            Home
          </button>
          {scheme && (
            <SchemeSwitch
              scheme={scheme}
              onChange={(next) =>
                sendCommand({ name: 'controlSchemeSet', payload: { scheme: next } })
              }
            />
          )}
        </div>
      </div>
      {status && (
        <div className={styles.sections} inert={!domeThere}>
          <SearchSection matches={matches} onSearch={search} onCommand={sendCommand} />
          <TourSection tours={menu?.tours ?? []} tour={status.tour} onCommand={sendCommand} />
          <ExhibitSection menu={menu} onCommand={sendCommand} />
          <TimeSection time={status.time} onCommand={sendCommand} />
          <ToggleSection toggles={status.toggles} onCommand={sendCommand} />
          <SetupSection onAddPhone={() => sendCommand({ name: 'togglePairing', payload: null })} />
        </div>
      )}
    </main>
  );
}

export default RemotePage;
