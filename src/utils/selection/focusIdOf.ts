/** focusIdOf — a focusable's durable focus id; an empty id counts as none. */

import { URL_HASH_FOR } from '../../services/url/urlHashFor';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';

export function focusIdOf(target: FocusableTarget): string | null {
  return URL_HASH_FOR[target.type](target) || null;
}
