import { FONTS } from '../../data/fonts';

/**
 * Union of registered font ids.  Used by `Label.font`, `LoadedFontAtlases`,
 * the renderer's per-instance attribute packing — anywhere a font is
 * referenced by id.
 *
 * Derived from the `FONTS` registry's keys (via `keyof typeof`) so the
 * union stays a strict string-literal union (`'cormorant' | …`) that can
 * never drift from the registry: adding a font widens the union for free.
 */
export type FontId = keyof typeof FONTS;
