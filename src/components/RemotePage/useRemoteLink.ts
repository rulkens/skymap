/**
 * useRemoteLink — the remote page's whole conversation with the dome as plain React state: the
 * link, a `hello` every second, the latest status and menu, and "the dome is gone" after three silent
 * seconds. The id is per page load, so a reload is a new remote to the dome. Every time the link
 * opens, the last trackpad size goes again: the dome attaches a remote's input only after a
 * `resize`, and the pad's first one is sent while the socket is still connecting, so it is lost.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createLocalTransport } from '../../services/remote/createLocalTransport';
import { parseDomeMessage } from '../../utils/remote/parseDomeMessage';
import { newLocalRoomCode } from '../../utils/remote/newLocalRoomCode';
import { HELLO_INTERVAL_MS } from '../../data/remote/helloIntervalMs';
import { REMOTE_SILENCE_MS } from '../../data/remote/remoteSilenceMs';
import type { DeviceEvent } from '../../@types/input/DeviceEvent';
import type { DomeStatus } from '../../@types/remote/DomeStatus';
import type { RemoteCommand } from '../../@types/remote/RemoteCommand';
import type { RemoteLink } from '../../@types/remote/RemoteLink';
import type { RemoteMenu } from '../../@types/remote/RemoteMenu';
import type { RemoteMessage } from '../../@types/remote/RemoteMessage';
import type { RemoteSearchMatch } from '../../@types/remote/RemoteSearchMatch';
import type { RemoteSession } from '../../@types/remote/RemoteSession';
import type { RoomCode } from '../../@types/remote/RoomCode';

// `randomUUID` exists only in secure contexts, and a phone on a plain-http LAN address is not one.
const newRemoteId = (): string => crypto.randomUUID?.() ?? newLocalRoomCode();

export function useRemoteLink(room: RoomCode | null): RemoteSession {
  const [status, setStatus] = useState<DomeStatus | null>(null);
  const [menu, setMenu] = useState<RemoteMenu | null>(null);
  const [domeThere, setDomeThere] = useState(true);
  const [matches, setMatches] = useState<readonly RemoteSearchMatch[]>([]);
  const linkRef = useRef<RemoteLink | null>(null);
  const [from] = useState(newRemoteId);
  const requestRef = useRef(0);
  const lastResize = useRef<DeviceEvent | null>(null);

  useEffect(() => {
    if (!room) return;
    const link = createLocalTransport().open(room);
    linkRef.current = link;
    let silence: ReturnType<typeof setTimeout>;
    const armSilence = (): void => {
      clearTimeout(silence);
      silence = setTimeout(() => setDomeThere(false), REMOTE_SILENCE_MS);
    };
    const hello = (): void => link.send(JSON.stringify({ from, kind: 'hello' }));
    armSilence();
    hello();
    const beat = setInterval(hello, HELLO_INTERVAL_MS);
    const offStatus = link.onStatus((linkStatus) => {
      if (linkStatus !== 'open') return;
      hello();
      const event = lastResize.current;
      if (event) link.send(JSON.stringify({ from, kind: 'device', event }));
    });
    const offText = link.onText((text) => {
      const message = parseDomeMessage(text);
      if (!message) return;
      if (message.kind === 'status') {
        setStatus(message.status);
        setDomeThere(true);
        armSilence();
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
  }, [room, from]);

  const send = useCallback(
    (message: RemoteMessage): void => linkRef.current?.send(JSON.stringify(message)),
    [],
  );
  const sendCommand = useCallback(
    (command: RemoteCommand): void => send({ from, kind: 'command', command }),
    [send, from],
  );
  const sendDevice = useCallback(
    (event: DeviceEvent): void => {
      if (event.kind === 'resize') lastResize.current = event;
      send({ from, kind: 'device', event });
    },
    [send, from],
  );
  const search = useCallback(
    (query: string): void => {
      // The relay hands results to every socket in the room, so the id must be this remote's own.
      const requestId = `${from}:${++requestRef.current}`;
      if (query === '') setMatches([]);
      else send({ from, kind: 'search', requestId, query });
    },
    [send, from],
  );

  return { status, domeThere, menu, matches, sendCommand, sendDevice, search };
}
