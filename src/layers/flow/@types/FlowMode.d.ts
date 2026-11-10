/**
 * FlowMode — which integration style the flow-field layer renders.
 *
 * The two modes are mutually exclusive (a single toggle), share one set of
 * GPU particle buffers, and trigger a reseed on switch:
 *
 *   - `'advect'`:     drifting particle ribbons — the iconic, unambiguous-
 *                     motion "hero" look. The default.
 *   - `'streamline'`: static integrated curves with a travelling pulse — a
 *                     steadier, map-like reading of the same velocity field.
 *
 * A string union, not a numeric enum, because the mode is CPU/UI state: the
 * renderer selects a compute entry point by mode, it never uploads the value
 * to a shader (contrast `BiasMode`, whose numeric values ARE the GPU
 * contract). Keeping it a string keeps the settings panel + handle readable.
 */
export type FlowMode = 'advect' | 'streamline';
