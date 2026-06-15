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
 *   - milkyWay   — the "YOU ARE HERE" Milky Way pin (a single label +
 *                  marker line). Fades in when the camera reaches the
 *                  band where the marker is meaningful.
 *   - structure  — cluster + named-anchor labels emitted by
 *                  `produceStructureLabels`.
 *   - galaxyNames — per-galaxy name labels (currently unused but
 *                   reserved; see future plans for hover-name overlay).
 *   - scaleBar   — the on-screen scale-bar HUD. Constructed by React,
 *                  not a GPU layer; reserved for tour integration.
 */
export type LabelLayerId = 'milkyWay' | 'structure' | 'galaxyNames' | 'scaleBar';
