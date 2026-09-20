/**
 * CAPTURE_HIDDEN_PASSES — the render passes `captureFeatured` hides so a
 * thumbnail shows no selection chrome. Spelled as strings, not imported from
 * `CONTENT_PASSES`: that registry's transitive `.wesl?static` shader imports
 * only resolve under Vite, never `tsx`. A test keeps the names honest.
 */
export const CAPTURE_HIDDEN_PASSES: readonly string[] = [
  'selection-ring',
  'near0-selection-ring',
  // A focused structure rings itself here, not in `selection-ring`.
  'structure-markers',
];
