/**
 * volume — the Layer's user-settable default, seeding `volumesSlice`. The
 * per-field knobs are not here: they come off each volume's SOURCE_REGISTRY
 * entry via `data/volume/volumeFieldDefaults.ts`.
 */

/**
 * Master toggle for the 3D scalar-field volume overlay defaults ON.
 *
 * The overlay renders additively into the same HDR offscreen target as the
 * galaxy points pass.  At startup no fields are registered yet (a volume
 * slot commit must load a cube first), so this default has no visual
 * effect until the first field arrives.
 * Defaulting to `true` means the overlay is ready to render as soon as the
 * first field is added — the user doesn't have to hunt for a master toggle
 * to see anything.
 *
 * Per-field `enabled` and `intensity` controls are the fine-grained knobs;
 * this flag is the coarser user-facing "hide all volumes" emergency off.
 */
export const DEFAULT_VOLUMES_ENABLED = true;
