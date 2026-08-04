/**
 * grantAndAwaitExpiry — grant one CDP virtual-time budget and await its
 * expiry event. The single stepping primitive shared by the recorder harness
 * (record.ts) and the gate spike (virtualTimeSpike.ts).
 *
 * Impure by design — this is CDP I/O, not a pure helper, so it lives here in
 * tools/record/ rather than tools/utils/ (whose one-function-per-file rule
 * covers pure pieces).
 *
 * ### Correctness invariants (why the body is shaped this way)
 *
 * - LISTENER BEFORE SEND: the 'Emulation.virtualTimeBudgetExpired' listener
 *   is attached before `session.send` dispatches the grant — the event can
 *   fire before send() resolves, and attaching after would drop it, hanging
 *   the wait forever.
 * - TIMEOUT RACE: a grant whose expiry never fires means the virtual-time
 *   pipeline is dead (page reloaded, session detached, renderer wedged).
 *   Racing the expiry against a fixed timeout turns that silent hang into a
 *   loud, labelled failure.
 * - ONCE/OFF CLEANUP: the listener is registered with `once` and explicitly
 *   `off`'d in the finally. Without the `off`, the timeout path would leave a
 *   stale listener that swallows the NEXT grant's expiry event; without
 *   `clearTimeout`, every successful grant would leak a live timer.
 */

import type { CDPSession } from '@playwright/test';

// A grant whose virtualTimeBudgetExpired never fires means the virtual-time
// pipeline is dead — fail loudly instead of hanging.
const BUDGET_EXPIRED_TIMEOUT_MS = 15_000;

export async function grantAndAwaitExpiry(
  session: CDPSession,
  budgetMs: number,
  label: string,
): Promise<void> {
  let onExpired: () => void = () => {};
  const expired = new Promise<void>((resolve) => {
    onExpired = () => resolve();
    session.once('Emulation.virtualTimeBudgetExpired', onExpired);
  });
  await session.send('Emulation.setVirtualTimePolicy', {
    policy: 'pauseIfNetworkFetchesPending',
    budget: budgetMs,
  });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `virtualTimeBudgetExpired never fired within ${BUDGET_EXPIRED_TIMEOUT_MS} ms ` +
              `(${label}) — the virtual-time pipeline is stalled`,
          ),
        ),
      BUDGET_EXPIRED_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([expired, timeout]);
  } finally {
    clearTimeout(timer);
    session.off('Emulation.virtualTimeBudgetExpired', onExpired);
  }
}
