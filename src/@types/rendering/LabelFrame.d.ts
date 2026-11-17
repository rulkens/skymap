/**
 * One director's per-frame label columns, sized to its records' capacity once and reused, so the
 * stages allocate nothing. Each stage writes only its own group; the envelope's group persists
 * across frames and follows each record's key across a re-encode.
 */
export type LabelFrame = {
  readonly capacity: number;
  // resolveAnchors
  /** 1 = the record has a position this frame. */
  readonly located: Uint8Array;
  // projectRecords
  /** 1 = located and in front of the eye. */
  readonly visible: Uint8Array;
  /** 1 = the drawn anchor is inside the image. */
  readonly onScreen: Uint8Array;
  /** The drawn (lifted) anchor, output px, +y down; two per record. */
  readonly px: Float32Array;
  /** Image-up at the anchor; two per record. */
  readonly up: Float32Array;
  readonly pxPerRad: Float32Array;
  /** The subject's apparent diameter, px on the axis scale (0 without a radius). */
  readonly diameterPx: Float32Array;
  readonly distanceMpc: Float64Array;
  /** The subject's view depth (along the view axis), Mpc. */
  readonly depthMpc: Float64Array;
  /** The em height on screen, `LABEL_TEXT_PX` × pxScale clamped. */
  readonly textPx: Float32Array;
  /** The ink rect at the drawn anchor, px: x0, y0, x1, y1 per record. Declutter and pick read it. */
  readonly rect: Float32Array;
  // targetAlpha
  readonly target: Float32Array;
  /** 1 = the label takes clicks this frame. */
  readonly clickable: Uint8Array;
  /** 1 = its subject is hovered or selected, so it keeps its label (spec D6.4). */
  readonly named: Uint8Array;
  // declutterRecords
  readonly rank: Float64Array;
  /** Record indices by rank, kept from the last frame so the sort starts nearly sorted. */
  readonly order: Uint32Array;
  orderCount: number;
  readonly accepted: Uint32Array;
  /** 1 = kept by declutter (or exempt from it). */
  readonly survivor: Uint8Array;
  // labelEnvelope
  /** exponentialApproach: the filter's running alpha. */
  readonly shown: Float32Array;
  /** smoothstepRamp: the last non-zero target, which a fade-out tail keeps drawing at. */
  readonly held: Float32Array;
  readonly rampFrom: Float32Array;
  readonly rampTo: Uint8Array;
  readonly rampSinceMs: Float64Array;
  /** 1 = first frame for this record's key: seeded, not eased. */
  readonly fresh: Uint8Array;
  /** The record key each envelope row belongs to, as of `generation`. */
  keys: readonly string[];
  generation: number;
  lastNowMs: number;
  /** True while any envelope is mid-ramp; the caller keeps the loop awake. */
  ramping: boolean;
};
