/**
 * The local transport: a WebSocket to the relay on this page's own host. A dropped socket is
 * reopened after a second until `close()`, or until the relay closes it for good: a remote whose
 * room rotated (4001), a host a newer host replaced (4002). Text with a top-level `relay` key is
 * the relay's own frame and never reaches `onText`; the relay drops a remote's forgeries.
 */
import type { DomeLink } from '../../@types/remote/DomeLink';
import type { RelayFrame } from '../../@types/remote/RelayFrame';
import type { RelayRoom } from '../../@types/remote/RelayRoom';
import type { RemoteLink } from '../../@types/remote/RemoteLink';
import type { RemoteLinkStatus } from '../../@types/remote/RemoteLinkStatus';
import type { RemoteTransport } from '../../@types/remote/RemoteTransport';
import type { RoomCode } from '../../@types/remote/RoomCode';
import { HOST_REPLACED_CLOSE_CODE } from '../../data/remote/hostReplacedCloseCode';
import { ROOM_ROTATED_CLOSE_CODE } from '../../data/remote/roomRotatedCloseCode';
import { parseRelayFrame } from '../../utils/remote/parseRelayFrame';

const RECONNECT_DELAY_MS = 1000;

function openLink(
  path: () => string,
  stopCode: number,
  onFrame: (frame: RelayFrame) => void,
): RemoteLink {
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
    const ws = new WebSocket(`${scheme}//${location.host}/__remote/${path()}`);
    socket = ws;
    ws.onopen = () => setStatus('open');
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      const frame = parseRelayFrame(event.data);
      if (frame !== null) return onFrame(frame);
      for (const listener of textListeners) listener(event.data);
    };
    ws.onclose = (event) => {
      setStatus('closed');
      if (!closed && event.code !== stopCode) retry = setTimeout(connect, RECONNECT_DELAY_MS);
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

function hostLink(): DomeLink {
  const roomListeners = new Set<(room: RelayRoom) => void>();
  // Reconnecting with the last issued code lets a restarted dev relay keep the phones' room.
  let last: RoomCode | null = null;
  const link = openLink(
    () => (last === null ? 'host' : `host?last=${last}`),
    HOST_REPLACED_CLOSE_CODE,
    ({ code, origin, onSky }) => {
      last = code;
      for (const listener of roomListeners) listener({ code, origin, onSky });
    },
  );
  return {
    ...link,
    onRoom: (listener) => {
      roomListeners.add(listener);
      return () => roomListeners.delete(listener);
    },
  };
}

export function createLocalTransport(): RemoteTransport {
  return {
    host: hostLink,
    open: (room) =>
      openLink(
        () => room,
        ROOM_ROTATED_CLOSE_CODE,
        () => {},
      ),
  };
}
