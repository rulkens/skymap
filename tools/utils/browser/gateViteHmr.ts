import type { Page } from '@playwright/test';

/**
 * gateViteHmr — relay Vite's HMR socket until the returned `close()`, then drop
 * every server message, so a booted page keeps the code it loaded: an edit in a
 * shared tree can neither hot-swap a module under the frame being captured nor
 * reload the page onto its rewritten hash (which has lost the link's `pose`).
 * Before `close()` a hot update becomes a full reload, which `bootHookedPage`
 * answers by reopening the link: a module swapped mid-boot left a half-built
 * engine. Call before `goto`.
 */
export async function gateViteHmr(page: Page): Promise<() => void> {
  let open = true;
  await page.routeWebSocket(
    (url) => url.searchParams.has('token'),
    (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        if (!open) return;
        const isUpdate = typeof message === 'string' && message.includes('"type":"update"');
        // Vite's client reloads the page on a path-less full-reload.
        ws.send(isUpdate ? '{"type":"full-reload"}' : message);
      });
    },
  );
  return () => {
    open = false;
  };
}
