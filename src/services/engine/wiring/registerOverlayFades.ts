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
 * The three overlay handles come first (Milky Way at its settings gate,
 * procedural + textured disks unconditionally at 1), then the volumes-master
 * gate, then the four label-layer handles.  The order within each group
 * matches the order in the source catalog of concerns so diffs are
 * easy to audit.
 *
 * ### Label-layer opacities
 *
 * youAreHere / poi / galaxyNames start at 0: their subsystem producers fire
 * fadeTo(1) on first non-empty emit.  scaleBar is React-side and
 * tour-addressable but never auto-faded by the engine, so it starts at 1.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';

/** Register overlay/volume-master/label-layer fade handles. See the module header for the opacity-coherence rationale. */
export function registerOverlayFades(state: EngineState): void {
  // ── Overlay handles ──────────────────────────────────────────────────
  //
  // Milky Way: registered at the current settings value (not a blanket 1)
  // because the toggle path multiplies this registry opacity into the
  // renderer's distance-based fadeAlpha.  A default-off session at 1 would
  // draw the Milky Way on frame 1 before any setImmediate(0) fires.
  state.subsystems.fades.register(
    { kind: 'overlay', id: 'milkyWay' },
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
    state.settings.volumes.masterEnabled ? 1 : 0,
  );

  // ── Label-layer handles ──────────────────────────────────────────────
  //
  // youAreHere / poi / galaxyNames start at 0: their producers fire fadeTo(1)
  // on first non-empty emit (see youAreHereSubsystem + poiSubsystem).
  // scaleBar is React-side — registered at 1 for tour addressability but
  // never auto-faded by the engine.
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'youAreHere' }, 0);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'poi' }, 0);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'galaxyNames' }, 0);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'scaleBar' }, 1);
}
