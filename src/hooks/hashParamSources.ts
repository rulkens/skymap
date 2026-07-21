/**
 * HASH_PARAM_SOURCES — the ordered table of hash params `useUrlSync` reads and
 * writes. Table order fixes the on-URL layout: `composeHashParams` emits values
 * in this order, so two identical states always produce byte-identical hashes.
 *
 * Only `focus` exists today. The write reuses `URL_HASH_FOR` (the FocusableTarget
 * → id-segment codec); the read reproduces the original single-param behaviour
 * exactly:
 *
 *   - a non-empty `focus=<id>`     ⇒ `requestFocus(id)`  (always, mount included)
 *   - an absent / empty `focus`    ⇒ `clearSelection()`  but ONLY on a hashchange
 *                                     (`isInitial === false`); the mount pass
 *                                     never clears, so a plain page load with no
 *                                     hash doesn't wipe a selection made elsewhere.
 *
 * The empty-value case (`focus=` with nothing after the `=`) is treated as absent
 * on purpose: the pre-seam read matched with `/^focus=(.+)$/`, whose `.+`
 * requires at least one character. `if (value)` reproduces that — an empty string
 * is falsy — so `focus=` still falls to the clear-on-hashchange arm.
 */

import type { HashParamSource } from '../@types/hooks/HashParamSource';
import { URL_HASH_FOR } from './urlHashFor';
import { requestFocus } from '../state/selection/requestFocus';
import { clearSelection } from '../state/selection/selectionSlice';

const focusSource: HashParamSource = {
  key: 'focus',
  write: (input) => {
    if (input.focused === null) return null;
    // Table dispatch on the union tag: galaxy ids run the codec ladder (null
    // when non-encodable), structures/bodies/stars yield their own id token.
    // An empty id (non-encodable row) contributes no param, same as null.
    return URL_HASH_FOR[input.focused.type](input.focused) || null;
  },
  read: ({ value, isInitial, dispatch }) => {
    if (value) dispatch(requestFocus(value));
    else if (!isInitial) dispatch(clearSelection());
  },
};

export const HASH_PARAM_SOURCES: readonly HashParamSource[] = [focusSource];
