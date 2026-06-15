/**
 * LabelLayerId — string-literal identifier for each label layer that
 * participates in the unified fade registry.
 *
 * Each layer fades independently. The registry keys
 * `{ kind: 'labelLayer', layer }` by the layer ID, so a future fifth
 * label layer is added by extending this union; nothing in the
 * registry itself needs to learn the new value.
 *
 * Current layers:
 *   - milkyWay   — the "You are here" Milky Way label (a single label +
 *                  marker line) emitted by produceMilkyWayLabel. The layer
 *                  fade carries the user toggle + load-in ramp; the producer
 *                  owns the camera-distance fade.
 *   - structure  — cluster + named-anchor labels emitted by
 *                  `produceStructureLabels`.
 *   - galaxyNames — per-galaxy name labels (currently unused but
 *                   reserved; see future plans for hover-name overlay).
 *   - scaleBar   — the on-screen scale-bar HUD. Constructed by React,
 *                  not a GPU layer; reserved for tour integration.
 */
export type LabelLayerId = 'milkyWay' | 'structure' | 'galaxyNames' | 'scaleBar';
