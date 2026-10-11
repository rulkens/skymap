import type { CdpClient } from './@types/CdpClient';
import type { CdpEvent } from './@types/CdpEvent';

const CONNECT_TIMEOUT_MS = 5000;
const CALL_TIMEOUT_MS = 15_000;

type Pending = { resolve: (value: never) => void; reject: (err: Error) => void };

/**
 * Open the browser-level DevTools WebSocket behind an `adb forward`ed port
 * (Node ≥ 22's global WebSocket, no dependency). Every call times out: a
 * phone tab can stop answering (`Runtime.evaluate` has hung for good), and a
 * hung call must fail the command, not the shell.
 */
export async function connectCdp(port: number): Promise<CdpClient> {
  const versionUrl = `http://localhost:${port}/json/version`;
  let wsUrl: string;
  try {
    const res = await fetch(versionUrl, { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
    wsUrl = ((await res.json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
  } catch (err) {
    throw new Error(
      `no DevTools endpoint at ${versionUrl} (${err instanceof Error ? err.message : String(err)}) — ` +
        'is the browser open on the phone with USB debugging on? Try `npm run phone -- devices`',
    );
  }
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`DevTools socket ${wsUrl} did not open`)),
      CONNECT_TIMEOUT_MS,
    );
    ws.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`DevTools socket ${wsUrl} failed to open`));
    };
  });

  let nextId = 0;
  const pending = new Map<number, Pending>();
  const listeners: ((event: CdpEvent) => void)[] = [];
  ws.onmessage = (message) => {
    const m = JSON.parse(String(message.data)) as {
      id?: number;
      error?: unknown;
      result?: never;
      method?: string;
      params?: Record<string, unknown>;
      sessionId?: string;
    };
    if (m.id !== undefined) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error !== undefined) p?.reject(new Error(JSON.stringify(m.error)));
      else p?.resolve(m.result as never);
    } else if (m.method !== undefined) {
      const event = { method: m.method, params: m.params ?? {}, sessionId: m.sessionId };
      for (const listener of listeners) listener(event);
    }
  };
  ws.onclose = () => {
    for (const p of pending.values()) p.reject(new Error('DevTools socket closed'));
    pending.clear();
  };

  return {
    call<T>(method: string, params = {}, sessionId?: string, timeoutMs = CALL_TIMEOUT_MS) {
      const id = ++nextId;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} got no answer within ${timeoutMs} ms`));
        }, timeoutMs);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    },
    onEvent: (listener) => listeners.push(listener),
    close: () => ws.close(),
  };
}
