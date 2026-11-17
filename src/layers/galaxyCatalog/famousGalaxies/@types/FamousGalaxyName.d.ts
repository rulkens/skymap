/**
 * A famous galaxy's identity, compiled into the bundle (`FAMOUS_GALAXY_NAMES`) so its name,
 * aliases and `famous-<id>` link work before `famous_galaxies_meta.json` loads. The prose
 * (description, type, calibration) stays in that sidecar.
 */
export type FamousGalaxyName = {
  readonly id: string;
  /** Preferred over `names[0]` when set; see `famousDisplayName`. */
  readonly commonName?: string;
  readonly names: readonly string[];
};
