/**
 * The non-Layer settings clusters a takeover captures and restores.
 *
 *   - `camera`      — a takeover pins the FOV: its poses are authored at one
 *                     lens, and a narrow viewer lens would silently clamp them.
 *   - `labels`      — the cross-cutting label-presentation mode.
 *   - `orbitTrails` — a visibility cue's target, so a cue must be undone.
 *   - `picking`     — a takeover drives which selection kinds a click resolves.
 */
export const CORE_SNAPSHOT_CLUSTERS = ['camera', 'labels', 'orbitTrails', 'picking'] as const;
