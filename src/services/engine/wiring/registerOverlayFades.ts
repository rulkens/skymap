/**
 * registerOverlayFades — registers the overlay, volume-master, and label-layer
 * fade handles into the engine's `FadeRegistry`.
 *
 * Called from `wireSlots` so each bootstrap concern lives in its own module.
 *
 * ### Why initial opacities are settings-derived (not a blanket 1.0)
 *
 * The fade registry is the single source of truth for every layer's opacity.
 * Registering at the wrong initial value produces a one-frame flash: a
 * disabled layer at 1 draws on frame 1 before a setImmediate(0) fires; an
 * enabled layer at 0 is invisible until a fadeTo(1) completes.  Each handle
 * below is initialised at the value that matches the session's persisted
 * settings so frame 1 is always coherent.
 *
 * ### Registration order
 *
 * The Milky-Way disk fade comes first (at its settings gate) followed by the
 * two overlay handles (procedural + textured disks unconditionally at 1),
 * then the volumes-master
 * gate, then the category-less label-layer handles (milkyWay / galaxyNames /
 * scaleBar — structure is per-category only), then the per-category marker +
 * structure-label handles (one pair per structure category).  The order within each
 * group matches the order in the source catalog of concerns so diffs are easy
 * to audit.
 *
 * ### Label-layer opacities
 *
 * milkyWay is registered at its persisted `settings.milkyWay.labelEnabled`
 * (mirroring the per-category structure label registration), so frame 1
 * honours a last-session-off label rather than flashing before a producer's
 * fadeTo; `produceMilkyWayLabel` then fires the load-in `fadeTo(1)` on its
 * first intended-visible emit.  galaxyNames starts at 1 because the
 * famous-galaxy labels reuse that handle and consume its opacity directly — a 0
 * would render them invisible.  scaleBar is React-side and tour-addressable but
 * never auto-faded by the engine, so it starts at 1.  There is no category-less
 * structure handle: structure labels use the per-category structure handles
 * below, and `produceStructureLabels` fires each category's load-in on first
 * emit.
 *
 * ### Per-category marker + structure-label handles
 *
 * Every structure category (cluster / supercluster / void / group) gets its
 * own `markerLayer{category}` and `labelLayer{structure, category}` controller so a
 * category's rings/labels can recede and fade independently.  Each is
 * registered at its persisted per-category visibility — the ring axis from
 * `structures.items[cat].enabled`, the label axis from
 * `structures.items[cat].labelEnabled` — so frame 1 honours what the user last
 * turned off rather than relying on a producer's first fadeTo.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { STRUCTURE_IDS } from '../../../data/structure/structureIds';

/** Register overlay/volume-master/label-layer fade handles. See the module header for the opacity-coherence rationale. */
export function registerOverlayFades(state: EngineState): void {
  // ── Milky-Way disk + overlay handles ─────────────────────────────────
  //
  // Milky Way disk: its own source-named fade kind (not an overlay).
  // Registered at the current settings value (not a blanket 1) because the
  // toggle path multiplies this registry opacity into the renderer's
  // distance-based fadeAlpha.  A default-off session at 1 would draw the
  // Milky Way on frame 1 before any setImmediate(0) fires.
  state.subsystems.fades.register(
    { kind: 'milkyWay' },
    state.settings.milkyWay.enabled ? 1 : 0,
  );
  // Disk overlays are always-on at boot: their LOD planners gate visibility
  // by apparent galaxy size, not by the fade-registry opacity.
  state.subsystems.fades.register({ kind: 'overlay', id: 'proceduralDisks' }, 1);
  state.subsystems.fades.register({ kind: 'overlay', id: 'texturedDisks' }, 1);

  // ── Scalar-volume master gate ────────────────────────────────────────
  //
  // Registered at the current settings value so a default-on session sees
  // 1.0 from frame 1 (the encodeHdr* multipliers don't suppress per-field
  // opacities) and a default-off session sits at 0 until the user toggles
  // master on (at which point setVolumesEnabled fires fadeTo(1) over
  // FADE_IN_DURATION_MS).
  state.subsystems.fades.register(
    { kind: 'volumesMaster' },
    state.settings.volumes.enabled ? 1 : 0,
  );

  // ── Label-layer handles ──────────────────────────────────────────────
  //
  // milkyWay registered at its persisted label toggle so a default-off label
  // sits at 0 from frame 1 (no flash before a producer's fadeTo);
  // produceMilkyWayLabel fires fadeTo(1) on its first intended-visible emit.
  // galaxyNames starts at 1 — famous-galaxy labels reuse this handle and
  // consume its opacity directly, so a 0 would hide them.  scaleBar is
  // React-side — registered at 1 for tour addressability but never auto-faded
  // by the engine.  structure is per-category only (registered below);
  // produceStructureLabels fires each category's load-in.
  state.subsystems.fades.register(
    { kind: 'labelLayer', layer: 'milkyWay' },
    state.settings.milkyWay.labelEnabled ? 1 : 0,
  );
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'galaxyNames' }, 1);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'scaleBar' }, 1);

  // ── Per-category marker + structure-label handles ──────────────────────────
  //
  // One structure + one structure labelLayer controller per structure source,
  // each seeded from the session's persisted per-source visibility so a
  // source the user turned off sits at 0 from frame 1 (no flash before a
  // producer's fadeTo).  Iterating STRUCTURE_IDS keeps this the single
  // runtime source of truth for the structure-id list.
  for (const category of STRUCTURE_IDS) {
    state.subsystems.fades.register(
      { kind: 'structure', id: category },
      state.settings.structures.items[category].enabled ? 1 : 0,
    );
    state.subsystems.fades.register(
      { kind: 'labelLayer', layer: 'structure', category },
      state.settings.structures.items[category].labelEnabled ? 1 : 0,
    );
  }
}
