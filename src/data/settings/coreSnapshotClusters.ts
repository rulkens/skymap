/**
 * The non-Layer settings clusters a takeover captures and restores.
 *
 *   - `camera`  — a takeover pins the FOV: its poses are authored at one
 *                 lens, and a narrow viewer lens would silently clamp them.
 *   - `labels`  — the cross-cutting label-presentation mode.
 *   - `picking` — a takeover drives which selection kinds a click resolves.
 */
export const CORE_SNAPSHOT_CLUSTERS = ['camera', 'labels', 'picking'] as const;
