/**
 * useRemoteLink — the remote page's whole conversation with the dome as plain React state: the
 * link, a `hello` every second, the latest status, and "the dome is gone" after three silent
 * seconds. The id is per page load, so a reload is a new remote to the dome.
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
import type { RemoteMessage } from '../../@types/remote/RemoteMessage';
import type { RemoteSearchMatch } from '../../@types/remote/RemoteSearchMatch';
import type { RemoteSession } from '../../@types/remote/RemoteSession';
import type { RoomCode } from '../../@types/remote/RoomCode';

// `randomUUID` exists only in secure contexts, and a phone on http://192.168.x.x is not one.
const newRemoteId = (): string => crypto.randomUUID?.() ?? newLocalRoomCode();

export function useRemoteLink(room: RoomCode | null): RemoteSession {
  const [status, setStatus] = useState<DomeStatus | null>(null);
  const [domeThere, setDomeThere] = useState(true);
  const [matches, setMatches] = useState<readonly RemoteSearchMatch[]>([]);
  const linkRef = useRef<RemoteLink | null>(null);
  const [from] = useState(newRemoteId);
  const requestRef = useRef(0);

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
    const offText = link.onText((text) => {
      const message = parseDomeMessage(text);
      if (!message) return;
      if (message.kind === 'status') {
        setStatus(message.status);
        setDomeThere(true);
        armSilence();
      } else if (message.requestId === String(requestRef.current)) {
        setMatches(message.matches);
      }
    });
    return () => {
      clearInterval(beat);
      clearTimeout(silence);
      offText();
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
    (event: DeviceEvent): void => send({ from, kind: 'device', event }),
    [send, from],
  );
  const search = useCallback(
    (query: string): void => {
      const requestId = String(++requestRef.current);
      if (query === '') setMatches([]);
      else send({ from, kind: 'search', requestId, query });
    },
    [send, from],
  );

  return { status, domeThere, matches, sendCommand, sendDevice, search };
}
