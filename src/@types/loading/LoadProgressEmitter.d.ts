import type { AssetSlot } from './AssetSlot';

/**
 * Public surface of the load-progress emitter.  `emit()` is exported so
 * the engine (or future ad-hoc callers) can force a recompute outside a
 * slot transition; `attachSlot` wires a slot's subscriber to call `emit`
 * on every state change.
 *
 * `destroy()` releases every subscriber attached via `attachSlot`.
 * Without this, slot state changes after `engine.destroy()` still fire
 * `publish`, holding the emit callback (and every closure it captures)
 * alive past intended lifetime — that's audit finding #15.  Idempotent:
 * a second call walks an empty list.
 */
export type LoadProgressEmitter = {
  emit(): void;
  attachSlot(slot: AssetSlot<unknown, unknown>): void;
  destroy(): void;
};
