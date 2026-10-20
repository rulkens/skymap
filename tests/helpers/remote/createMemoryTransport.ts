/**
 * An in-memory `RemoteTransport` for one dome: the test speaks "as a remote"
 * through `fromRemote`, flips the link with `linkStatus`, and reads every
 * message the dome sent, parsed, from `sent`.
 */
import type { DomeMessage } from '../../../src/@types/remote/DomeMessage';
import type { RemoteLinkStatus } from '../../../src/@types/remote/RemoteLinkStatus';
import type { RemoteTransport } from '../../../src/@types/remote/RemoteTransport';

export function createMemoryTransport() {
  const textListeners = new Set<(text: string) => void>();
  const statusListeners = new Set<(status: RemoteLinkStatus) => void>();
  const sent: DomeMessage[] = [];
  let opened: string | null = null;

  const transport: RemoteTransport = {
    newRoom: () => 'ROOM0000',
    pairingOrigins: async () => ['http://192.168.1.2:5173'],
    open: (room) => {
      opened = room;
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
        close: () => {},
      };
    },
  };

  return {
    transport,
    sent,
    opened: () => opened,
    fromRemote: (text: string) => textListeners.forEach((listener) => listener(text)),
    linkStatus: (status: RemoteLinkStatus) => statusListeners.forEach((l) => l(status)),
  };
}
