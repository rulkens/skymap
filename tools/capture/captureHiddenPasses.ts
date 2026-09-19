/**
 * CAPTURE_HIDDEN_PASSES — the render passes `captureFeatured` hides (via
 * `setPassDisabled`) so a thumbnail shows no selection chrome. A focused
 * structure's ring draws in `structure-markers`, not `selection-ring` — see
 * `captureHiddenPasses.test.ts`, which checks each name against the real
 * `CONTENT_PASSES` registry (this file can't import it: its transitive
 * `.wesl?static` shader imports only resolve under Vite, never `tsx`).
 */
export const CAPTURE_HIDDEN_PASSES: readonly string[] = [
  'selection-ring', // galaxy / Milky Way ring (selectionRingPass)
  'near0-selection-ring', // body / star ring (near0SelectionRingPass)
  'structure-markers', // a focused structure's ring (structureMarkersPass)
];
