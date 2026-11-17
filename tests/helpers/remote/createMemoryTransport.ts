/**
 * An in-memory `RemoteTransport` for one dome: the test issues rooms with `room`,
 * speaks "as a remote" through `fromRemote`, flips the link with `linkStatus`, and
 * reads every message the dome sent, parsed, from `sent`.
 */
import type { DomeMessage } from '../../../src/@types/remote/DomeMessage';
import type { RelayRoom } from '../../../src/@types/remote/RelayRoom';
import type { RemoteLinkStatus } from '../../../src/@types/remote/RemoteLinkStatus';
import type { RemoteTransport } from '../../../src/@types/remote/RemoteTransport';

export function createMemoryTransport() {
  const textListeners = new Set<(text: string) => void>();
  const statusListeners = new Set<(status: RemoteLinkStatus) => void>();
  const roomListeners = new Set<(room: RelayRoom) => void>();
  const sent: DomeMessage[] = [];
  let hosted = false;

  const transport: RemoteTransport = {
    host: () => {
      hosted = true;
      return {
        send: (text) => sent.push(JSON.parse(text) as DomeMessage),
        onText: (listener) => {
          textListeners.add(listener);
          return () => textListeners.delete(listener);
        },
        onStatus: (listener) => {
          statusListeners.add(listener);
          return () => statusListeners.delete(listener);
        },
        onRoom: (listener) => {
          roomListeners.add(listener);
          return () => roomListeners.delete(listener);
        },
        close: () => {},
      };
    },
    open: () => {
      throw new Error('a dome hosts; it never joins a room');
    },
  };

  return {
    transport,
    sent,
    hosted: () => hosted,
    room: (room: RelayRoom) => roomListeners.forEach((listener) => listener(room)),
    fromRemote: (text: string) => textListeners.forEach((listener) => listener(text)),
    linkStatus: (status: RemoteLinkStatus) => statusListeners.forEach((l) => l(status)),
  };
}
