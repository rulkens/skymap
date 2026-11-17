/**
 * DebugViewKind — the four debug overlays, each a weight in [0,1] that
 * crossfades over the galaxy independently of the other three. `DEBUG_VIEWS`
 * (`tools/galaxy-renderer/src/data/debugViews.ts`) is keyed by this, so a
 * fifth kind is a compile error until it has a row.
 */

export type DebugViewKind = 'dust' | 'ismMap' | 'orientation' | 'bubble';
