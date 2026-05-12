/**
 * 2D point in CSS-pixel space (i.e. `clientX`/`clientY`).  The engine
 * converts to texture-space pixels via its own `cssToTexPx` helper at
 * the call site that needs it (currently the click-resolver).
 */
export type CssPx = { x: number; y: number };
