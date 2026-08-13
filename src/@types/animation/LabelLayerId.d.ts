/**
 * LabelLayerId — string-literal identifier for each label layer that
 * participates in the unified fade registry.
 *
 * Each layer fades independently. The registry keys
 * `{ kind: 'labelLayer', layer }` by the layer ID, so a future label layer is
 * added by extending this union; nothing in the registry itself needs to learn
 * the new value.
 *
 * The names track the SOURCE TYPE that produces the layer's labels, so a
 * registry row's `labelLayer` reads as "which of my siblings do I share a fade
 * with". `scaleBar` is the one member with no producing source type — it is a
 * React-side HUD element, reserved for tour integration.
 *
 * Current layers:
 *   - milkyWay    — the "You are here" Milky Way label (a single label +
 *                   marker line) emitted by produceMilkyWayLabel. The layer
 *                   fade carries the user toggle + load-in ramp; the producer
 *                   owns the camera-distance fade.
 *   - structure   — cluster + named-anchor labels emitted by
 *                   `produceStructureLabels`.
 *   - galaxy      — per-galaxy name labels (the famous-galaxy atlas names).
 *   - starCatalog — curated star-map captions, emitted through the
 *                   foreground-labels layer on the NEAR0 slab.
 *   - body        — scene-body captions (Sun, Earth, planets), likewise on the
 *                   foreground-labels layer.
 *   - scaleBar    — the on-screen scale-bar HUD. Constructed by React,
 *                   not a GPU layer; reserved for tour integration.
 *   - zoneOfAvoidance — the "Zone of Avoidance" curved lettering on the
 *                   galactic-plane dust band overlay.
 */
export type LabelLayerId =
  | 'milkyWay'
  | 'structure'
  | 'galaxy'
  | 'starCatalog'
  | 'body'
  | 'scaleBar'
  | 'zoneOfAvoidance';
