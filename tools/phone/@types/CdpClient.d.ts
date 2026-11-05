import type { CdpEvent } from './CdpEvent';

/** One browser-level DevTools WebSocket; `sessionId` routes a call to an attached tab. */
export type CdpClient = {
  call<T = Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
    timeoutMs?: number,
  ): Promise<T>;
  onEvent(listener: (event: CdpEvent) => void): void;
  close(): void;
};
