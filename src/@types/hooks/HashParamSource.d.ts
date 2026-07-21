/**
 * HashParamSource — one entry in the `HASH_PARAM_SOURCES` table that owns a
 * single `key=value` slot of `window.location.hash`.
 *
 * `useUrlSync` used to hard-code a lone `focus=<id>` param on both the read and
 * write side. A source generalises that into an `&`-separated multi-param URL:
 * each source declares its `key`, how to WRITE its desired value from the
 * store-derived hash input, and how to READ a present/absent value back into
 * dispatches. `focus` is the first (and, in prep, only) source; the time-control
 * feature appends `t` as a pure table row without touching the hook.
 *
 * ── write ──
 * Given the same `DesiredHashInput` the write effect derives from the store,
 * return this param's value, or `null` to omit the param entirely (so a source
 * with nothing to say contributes no bytes to the hash). `composeHashParams`
 * joins the non-null values in table order.
 *
 * ── read ──
 * Called once per parsed hash with `value` = the param's string (or `undefined`
 * when the key is absent from the URL). `isInitial` is true only for the mount
 * pass, so a source can suppress an "absent ⇒ clear" dispatch on first load while
 * still firing it on back/forward `hashchange` navigation. The source acts via
 * the passed `dispatch` rather than returning actions — the set of dispatches a
 * source needs (`requestFocus` vs `clearSelection`) is per-source, so returning a
 * single shape would over-constrain future rows.
 */

import type { DesiredHashInput } from '../../hooks/useUrlSync';
import type { AppDispatch } from '../../store/types';

export type HashParamSource = {
  readonly key: string;
  readonly write: (input: DesiredHashInput) => string | null;
  readonly read: (args: {
    readonly value: string | undefined;
    readonly isInitial: boolean;
    readonly dispatch: AppDispatch;
  }) => void;
};
