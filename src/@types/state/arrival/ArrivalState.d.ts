/**
 * ArrivalState — whether the boot link's subject is on screen yet. `reason`
 * is set only on `'failed'`, which lifts the veil on the home view, or, for
 * `'engine-error'`, on no view at all.
 */
export type ArrivalState = {
  readonly status: 'pending' | 'arrived' | 'failed';
  readonly reason?: 'unknown-id' | 'timeout' | 'engine-error';
};
