/**
 * famousDisplayName — single source of truth for the human-readable
 * name shown for a famous-galaxy entry.
 *
 * Used by both `galaxyInfoBuilder.ts` (InfoCard headline) and
 * `produceFamousLabels.ts` (the famous-label producer) so the two surfaces
 * can't drift: hover a dot and the string in the label matches the
 * string in the panel.
 *
 * ### Implementation
 *
 * The name resolution is a priority-ordered list of candidates with
 * a single "first non-empty wins" selection rule:
 *
 *   [ commonName, ...names, id ]
 *
 * - `commonName` (curated, e.g. "Andromeda Galaxy") wins when set.
 * - Otherwise the first catalog alias in `names` wins (e.g. "M31").
 * - `id` is the defensive tail — every valid seed entry has a non-
 *   empty id, so the list always contains at least one valid entry.
 *
 * Structural type rather than importing `FamousGalaxyMetaEntry` directly,
 * so build-side callers (`tools/buildFamous.ts` and friends, which
 * consume `FamousEntry`) can pass their own seed shape too.
 */

export type FamousNamedEntry = {
  readonly id: string;
  readonly names: readonly string[];
  readonly commonName?: string;
};

export function famousDisplayName(e: FamousNamedEntry): string {
  const candidates: ReadonlyArray<string | undefined> = [e.commonName, ...e.names, e.id];
  return candidates.find((c) => c !== undefined && c.length > 0) ?? e.id;
}
