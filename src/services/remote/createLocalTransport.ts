/**
 * The local transport: a WebSocket to the Vite relay on this page's own host. A dropped socket
 * is reopened after a second until `close()`; the status listeners see every transition.
 */
import type { RemoteLink } from '../../@types/remote/RemoteLink';
import type { RemoteLinkStatus } from '../../@types/remote/RemoteLinkStatus';
import type { RemoteTransport } from '../../@types/remote/RemoteTransport';
import { newLocalRoomCode } from '../../utils/remote/newLocalRoomCode';

const RECONNECT_DELAY_MS = 1000;

function openLink(room: string): RemoteLink {
  const textListeners = new Set<(text: string) => void>();
  const statusListeners = new Set<(status: RemoteLinkStatus) => void>();
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const setStatus = (status: RemoteLinkStatus): void => {
    for (const listener of statusListeners) listener(status);
  };
  const connect = (): void => {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${scheme}//${location.host}/__remote/${room}`);
    socket = ws;
    setStatus('connecting');
    ws.onopen = () => setStatus('open');
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      for (const listener of textListeners) listener(event.data);
    };
    ws.onclose = () => {
      setStatus('closed');
      if (!closed) retry = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  };
  connect();

  return {
    send: (text) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(text);
    },
    onText: (listener) => {
      textListeners.add(listener);
      return () => textListeners.delete(listener);
    },
    onStatus: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    close: () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    },
  };
}

export function createLocalTransport(): RemoteTransport {
  return {
    newRoom: () => newLocalRoomCode(),
    open: openLink,
    pairingOrigins: async () => {
      try {
        const response = await fetch('/__remote/origins');
        return (await response.json()) as string[];
      } catch {
        return [location.origin];
      }
    },
  };
}
