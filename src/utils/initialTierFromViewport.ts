/**
 * initialTierFromViewport — choose the runtime tier from the browser viewport
 * width at engine startup.
 *
 * ### Why pure (and not driven by feature detection)?
 *
 * Viewport width is an honest proxy for "is this a phone-class device?".
 * `navigator.deviceMemory`, `hardwareConcurrency`, and the GPU adapter info
 * are either unreliable cross-browser, gated by Permissions-Policy, or both.
 * The 768px breakpoint matches Bootstrap/Tailwind's `md` boundary — common
 * enough that users intuitively expect "tablet and up" to behave like a
 * desktop.
 *
 * 'large' is intentionally never auto-selected: the full 2.5M-point catalog
 * stresses integrated GPUs and the user should opt-in.
 *
 * ### Defensive edge cases
 *
 * - NaN / Infinity → 'medium'.  `window.innerWidth` should never produce
 *   these in practice, but a defensive default keeps a faulty embedding
 *   (`<iframe width="auto">` in some host) from picking 'small' silently.
 * - 0 / negative   → 'small'.  Conservatively mobile-leaning when the
 *   viewport reports junk; a phone in landscape with a stale DOM read
 *   may transiently report 0.
 */

import type { Tier } from '../@types/data/Tier';

const MOBILE_BREAKPOINT_PX = 768;

export function initialTierFromViewport(width: number): Tier {
  if (!Number.isFinite(width)) return 'medium';
  if (width <= 0) return 'small';
  return width < MOBILE_BREAKPOINT_PX ? 'small' : 'medium';
}
