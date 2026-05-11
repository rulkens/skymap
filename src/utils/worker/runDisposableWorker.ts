/**
 * runDisposableWorker — generic helper for the "spawn a Worker, send
 * one message, wait for one reply, terminate" lifecycle that every
 * off-thread bake in skymap follows.
 *
 * ### Why this module exists
 *
 * Three production sites (Schechter-ratio bake, angular-weight bake,
 * point interleaved-buffer bake) used to inline the same 12-line
 * Promise-wraps-Worker ceremony. The pattern is:
 *
 *   1. `new WorkerCtor()` — fresh worker per call (no shared state).
 *   2. Attach `onmessage` → terminate + resolve(event.data).
 *   3. Attach `onerror` → terminate + reject(event.error ?? message-based fallback).
 *   4. `postMessage(input, transfer)`.
 *
 * Pulling it here means: one place to fix bugs in the cleanup
 * sequence; one place to add a future timeout / abort signal; one
 * place to standardise error fallback messages across bakes.
 *
 * ### Why "disposable"
 *
 * The worker lives for exactly one round trip. The helper doesn't
 * support reuse — that's a different abstraction (a worker pool)
 * with a different lifecycle (cancellation, queuing, lifetime
 * management). The name pins that this is the one-shot variant.
 *
 * ### Error fallback chain
 *
 * Workers can emit ErrorEvents with `event.error`, `event.message`,
 * or neither set. The helper prefers (in order):
 *   1. `event.error` — the most informative form, usually a real Error.
 *   2. `new Error(event.message)` — wraps a plain string in an Error.
 *   3. `new Error('<label> worker error')` — last-resort label-only
 *      fallback so the rejection still carries the bake name.
 */

/**
 * Spawn `WorkerCtor`, post `input` (transferring `transfer`), and
 * resolve with the worker's first message — or reject if the worker
 * emits an error. Terminates the worker on either path.
 *
 * `label` is woven into the all-fallback error message so a rejection
 * with no message and no error still tells you which bake failed.
 */
export function runDisposableWorker<TIn, TOut>(
  WorkerCtor: new () => Worker,
  input: TIn,
  transfer: Transferable[],
  label: string,
): Promise<TOut> {
  return new Promise<TOut>((resolve, reject) => {
    const worker = new WorkerCtor();
    worker.onmessage = (event: MessageEvent<TOut>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      worker.terminate();
      reject(event.error ?? new Error(event.message || `${label} worker error`));
    };
    worker.postMessage(input, transfer);
  });
}
