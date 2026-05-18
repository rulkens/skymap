/**
 * HexString — a CSS-style hex colour literal in `#RRGGBB` or `#RRGGBBAA`
 * form.  The leading `#` is enforced at the type level via a template
 * literal; length and hex-digit validity are checked at runtime by the
 * consumer (typically `hexToGl`).
 *
 * Short forms (`#RGB`, `#RGBA`) are NOT supported — keeping the surface
 * narrow means call-sites don't accidentally expand to subtly different
 * GL values depending on which form they used.  If a short-form helper
 * is ever needed, add it as a separate type rather than overloading
 * this one.
 */
export type HexString = `#${string}`;
