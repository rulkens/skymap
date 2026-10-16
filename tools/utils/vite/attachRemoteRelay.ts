/**
 * The remote relay: a room per `/__remote/<code>` path, each text message rebroadcast to the
 * room's other sockets. Only `/__remote/` upgrades are claimed, so Vite's own HMR socket (a
 * different path) still reaches its handler.
 */
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

export const REMOTE_PATH_PREFIX = '/__remote/';
const MAX_MESSAGE_BYTES = 16384;
const MAX_SOCKETS_PER_ROOM = 4;
const POLICY_VIOLATION = 1008;

export function attachRemoteRelay(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map<string, Set<WebSocket>>();

  server.on('upgrade', (request, socket, head) => {
    const path = (request.url ?? '').split('?')[0] ?? '';
    if (!path.startsWith(REMOTE_PATH_PREFIX)) return;
    const room = path.slice(REMOTE_PATH_PREFIX.length);
    wss.handleUpgrade(request, socket, head, (ws) => {
      const members = rooms.get(room) ?? new Set<WebSocket>();
      if (room === '' || members.size >= MAX_SOCKETS_PER_ROOM) {
        ws.close(POLICY_VIOLATION);
        return;
      }
      members.add(ws);
      rooms.set(room, members);
      ws.on('message', (data, isBinary) => {
        if (isBinary) return;
        const text = data.toString();
        if (Buffer.byteLength(text) > MAX_MESSAGE_BYTES) return;
        for (const peer of members) if (peer !== ws) peer.send(text);
      });
      ws.on('error', () => {});
      ws.on('close', () => {
        members.delete(ws);
        if (members.size === 0) rooms.delete(room);
      });
    });
  });
}
