/**
 * SourceMasks — the two per-source bitmasks `sourceMaskOf` projects from
 * settings + live fade opacity. A transient return value, not stored state:
 * the Layer derives it where it reads it, each frame and at click time.
 */
export type SourceMasks = {
  /** draw — bit set when `enabled || fade opacity > 0` (a just-hidden catalog keeps drawing through its fade-out tail). */
  readonly draw: number;
  /** pick — bit set when `enabled` alone (intent): a catalog is unclickable the instant it's toggled off, even mid-fade. */
  readonly pick: number;
};
