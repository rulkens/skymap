/**
 * BodyRowSource — a `RenderStepSpec.slab` naming a per-frame body-row list
 * rather than a fixed index. Body rows cannot be authored: their painter-order
 * indices come from `deriveSlabs`, so the frame resolves them into
 * `FrameInputs.bodyRowSlabs`.
 */
export type BodyRowSource = 'lens' | 'insideAtmosphere';
