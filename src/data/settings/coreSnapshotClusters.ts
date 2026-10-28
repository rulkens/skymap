/**
 * The non-Layer settings clusters a takeover captures and restores.
 *
 *   - `labels`  — the cross-cutting label-presentation mode.
 *   - `picking` — a takeover drives which selection kinds a click resolves.
 *
 * The lens a takeover pins is camera state, not a cluster: `SceneSnapshot.lens` carries it.
 */
export const CORE_SNAPSHOT_CLUSTERS = ['labels', 'picking'] as const;
