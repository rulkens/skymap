/**
 * focusIdOf — a focusable's durable focus id, the value the URL's `focus`
 * param carries; null when the target is not link-encodable. An empty id
 * (a non-encodable galaxy row) counts as none.
 */

import { URL_HASH_FOR } from '../../services/url/urlHashFor';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';

export function focusIdOf(target: FocusableTarget): string | null {
  return URL_HASH_FOR[target.type](target) || null;
}
