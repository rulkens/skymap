/**
 * How the antique look names one label producer's labels (`ANTIQUE_LABEL_RULES`,
 * keyed by the producer's `label` entry). A c.1690 plate knows a handful of
 * objects per category, so a category either keeps what the table does not
 * name (stars, constellations) or hides it (galaxies, structures, moons).
 */

export type AntiqueLabelRule = {
  /** What a label whose id `names` does not list does: keep its own text, or hide. */
  readonly unlisted: 'keep' | 'hide';
  /** How the engraver cuts it: italic as named (stars), or letter-spaced roman capitals. */
  readonly lettering: 'italic' | 'capitals';
  /** Label id → its period name, or null to hide it. */
  readonly names: Readonly<Record<string, string | null>>;
};
