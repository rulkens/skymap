/**
 * ArrivalState — whether the boot link's subject is on screen yet. `reason`
 * is set only on `'failed'`, which lifts the veil on the home view.
 */
export type ArrivalState = {
  readonly status: 'pending' | 'arrived' | 'failed';
  readonly reason?: 'unknown-id' | 'timeout';
};
