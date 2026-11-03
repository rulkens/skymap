/**
 * RemotePage — the phone-or-laptop remote: a trackpad that steers the dome's camera, then a deck
 * of tiles whose sheets send named commands. The dome owns all state; this page only renders its
 * latest status, so nothing here is optimistic, and the deck waits for the dome's first status.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import cx from 'classnames';
import { useRemoteLink } from './useRemoteLink';
import JoinField from './JoinField/JoinField';
import LinkStatus from './LinkStatus/LinkStatus';
import LostNotice from './LostNotice/LostNotice';
import VersionNotice from './VersionNotice/VersionNotice';
import AxisHoldButtons from './AxisHoldButtons/AxisHoldButtons';
import Trackpad from './Trackpad/Trackpad';
import SearchSection from './SearchSection/SearchSection';
import TourSection from './TourSection/TourSection';
import ExhibitSection from './ExhibitSection/ExhibitSection';
import TimeSection from './TimeSection/TimeSection';
import ToggleSection from './ToggleSection/ToggleSection';
import SetupSection from './SetupSection/SetupSection';
import RemoteIcon from './RemoteIcon/RemoteIcon';
import RemoteSheet from './RemoteSheet/RemoteSheet';
import LibraryTiles from './LibraryTiles/LibraryTiles';
import NowCard from './NowCard/NowCard';
import SchemeSwitch from './SchemeSwitch/SchemeSwitch';
import type { RemoteNavAxis } from '../../@types/remote/RemoteNavAxis';
import type { RemoteSheetId } from '../../@types/remote/RemoteSheetId';
import controls from './remoteControls.module.css';
import styles from './RemotePage.module.css';

const roomFromHash = (): string | null => location.hash.slice(1) || null;

function RemotePage() {
  const [room, setRoom] = useState(roomFromHash);
  const { status, link, menu, matches, sendCommand, sendDevice, search } = useRemoteLink(room);
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

  const [openSheet, setOpenSheet] = useState<RemoteSheetId | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeSheet = useCallback(() => setOpenSheet(null), []);
  // After the close commits, so the tile is no longer inert.
  useEffect(() => {
    if (openSheet === null) openerRef.current?.focus();
  }, [openSheet]);

  // Rendered only inside the deck, which exists once a status has arrived.
  const takeover = status?.takeover ?? null;
  const sheetBody: Record<RemoteSheetId, () => ReactNode> = {
    search: () => <SearchSection matches={matches} onSearch={search} onCommand={sendCommand} />,
    tours: () => (
      <TourSection
        tours={menu?.tours ?? []}
        tour={takeover?.kind === 'tour' ? takeover : null}
        onCommand={sendCommand}
      />
    ),
    exhibits: () => <ExhibitSection menu={menu} onCommand={sendCommand} />,
    clips: () => <ExhibitSection menu={menu} onCommand={sendCommand} />,
    time: () => status && <TimeSection time={status.time} onCommand={sendCommand} />,
    labels: () => status && <ToggleSection toggles={status.toggles} onCommand={sendCommand} />,
    setup: () => (
      <SetupSection onAddPhone={() => sendCommand({ name: 'togglePairing', payload: null })} />
    ),
  };

  if (!room) {
    return (
      <main className={styles.root}>
        <JoinField onJoin={join} />
      </main>
    );
  }

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <LinkStatus state={link} />
        {link === 'connected' && (
          <span className={styles.focus}>{status?.focus?.name ?? 'Nothing focused'}</span>
        )}
      </header>
      {link === 'lost' && <LostNotice room={room} onChangeCode={() => join(null)} />}
      {(link === 'domeOlder' || link === 'domeNewer') && <VersionNotice state={link} />}
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
            <RemoteIcon glyph="home" />
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
        <div className={styles.deck} inert={link !== 'connected'}>
          <div className={styles.library} inert={openSheet !== null}>
            <NowCard takeover={takeover} menu={menu} time={status.time} onCommand={sendCommand} />
            <LibraryTiles
              onOpen={(id, tile) => {
                openerRef.current = tile;
                setOpenSheet(id);
              }}
            />
          </div>
          {openSheet && (
            <RemoteSheet
              id={openSheet}
              initialFocus={openSheet === 'search' ? 'field' : 'heading'}
              onClose={closeSheet}
            >
              {sheetBody[openSheet]()}
            </RemoteSheet>
          )}
        </div>
      )}
    </main>
  );
}

export default RemotePage;
