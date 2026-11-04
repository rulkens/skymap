/**
 * useRemoteLink — the remote page's whole conversation with the dome as plain React state: the
 * link, a `hello` every second, the latest status and menu, "the dome is gone" after three silent
 * seconds, and which page needs a reload when the dome speaks another protocol version. The id is
 * per page load, so a reload is a new remote to the dome.
 *
 * Every time the link opens, the last trackpad size goes again: the dome attaches a remote's input
 * only after a `resize`, and the pad's first one is sent while the socket is still connecting, so
 * it is lost.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createLocalTransport } from '../../services/remote/createLocalTransport';
import { parseDomeMessage } from '../../utils/remote/parseDomeMessage';
import { domeClockFromStatus } from '../../utils/remote/domeClockFromStatus';
import { newLocalRoomCode } from '../../utils/remote/newLocalRoomCode';
import { HELLO_INTERVAL_MS } from '../../data/remote/helloIntervalMs';
import { REMOTE_SILENCE_MS } from '../../data/remote/remoteSilenceMs';
import { REMOTE_PROTOCOL_VERSION } from '../../data/remote/remoteProtocolVersion';
import type { DeviceEvent } from '../../@types/input/DeviceEvent';
import type { DomeLinkState } from '../../@types/remote/DomeLinkState';
import type { DomeStatus } from '../../@types/remote/DomeStatus';
import type { RemoteCommand } from '../../@types/remote/RemoteCommand';
import type { RemoteLink } from '../../@types/remote/RemoteLink';
import type { RemoteMenu } from '../../@types/remote/RemoteMenu';
import type { RemoteMessage } from '../../@types/remote/RemoteMessage';
import type { RemoteMessageBody } from '../../@types/remote/RemoteMessageBody';
import type { RemoteSearchMatch } from '../../@types/remote/RemoteSearchMatch';
import type { RemoteSession } from '../../@types/remote/RemoteSession';
import type { RoomCode } from '../../@types/remote/RoomCode';
import type { TimeState } from '../../@types/time/TimeState';

export function useRemoteLink(room: RoomCode | null): RemoteSession {
  const [status, setStatus] = useState<DomeStatus | null>(null);
  const [clock, setClock] = useState<TimeState | null>(null);
  const [menu, setMenu] = useState<RemoteMenu | null>(null);
  const [domeLink, setDomeLink] = useState<DomeLinkState>('looking');
  const [matches, setMatches] = useState<readonly RemoteSearchMatch[]>([]);
  const linkRef = useRef<RemoteLink | null>(null);
  const [from] = useState(() => newLocalRoomCode());
  const requestRef = useRef(0);
  const lastResize = useRef<DeviceEvent | null>(null);

  const send = useCallback(
    (body: RemoteMessageBody): void => {
      const message: RemoteMessage = { v: REMOTE_PROTOCOL_VERSION, from, ...body };
      linkRef.current?.send(JSON.stringify(message));
    },
    [from],
  );

  useEffect(() => {
    if (!room) return;
    const link = createLocalTransport().open(room);
    linkRef.current = link;
    let silence: ReturnType<typeof setTimeout>;
    const armSilence = (): void => {
      clearTimeout(silence);
      silence = setTimeout(() => setDomeLink('lost'), REMOTE_SILENCE_MS);
    };
    const hello = (): void => send({ kind: 'hello' });
    armSilence();
    const beat = setInterval(hello, HELLO_INTERVAL_MS);
    const offStatus = link.onStatus((linkStatus) => {
      if (linkStatus !== 'open') return;
      hello();
      const event = lastResize.current;
      if (event) send({ kind: 'device', event });
    });
    const offText = link.onText((text) => {
      const parsed = parseDomeMessage(text);
      if (!parsed) return;
      // A dome at another version is still there: it answers, it just cannot be read.
      armSilence();
      if (parsed.v !== REMOTE_PROTOCOL_VERSION) {
        setDomeLink(parsed.v < REMOTE_PROTOCOL_VERSION ? 'domeOlder' : 'domeNewer');
        return;
      }
      const { message } = parsed;
      if (!message) return;
      setDomeLink('connected');
      if (message.kind === 'status') {
        setStatus(message.status);
        setClock(domeClockFromStatus(message.status.time, performance.now()));
      } else if (message.kind === 'menu') {
        setMenu(message.menu);
      } else if (message.requestId === `${from}:${requestRef.current}`) {
        setMatches(message.matches);
      }
    });
    return () => {
      clearInterval(beat);
      clearTimeout(silence);
      offText();
      offStatus();
      link.close();
      linkRef.current = null;
    };
  }, [room, from, send]);

  const sendCommand = useCallback(
    (command: RemoteCommand): void => send({ kind: 'command', command }),
    [send],
  );
  const sendDevice = useCallback(
    (event: DeviceEvent): void => {
      if (event.kind === 'resize') lastResize.current = event;
      send({ kind: 'device', event });
    },
    [send],
  );
  const search = useCallback(
    (query: string): void => {
      // The relay hands results to every socket in the room, so the id must be this remote's own.
      const requestId = `${from}:${++requestRef.current}`;
      if (query === '') setMatches([]);
      else send({ kind: 'search', requestId, query });
    },
    [send, from],
  );

  return { status, clock, link: domeLink, menu, matches, sendCommand, sendDevice, search };
}
