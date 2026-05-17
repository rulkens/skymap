/**
 * OverlayId — string-literal identifier for each always-on GPU overlay
 * that registers with the fade registry at opacity 1.0.
 *
 * These layers don't auto-fade on loading (they're either procedurally
 * generated or already in the bundle), but they register with the
 * registry so future tour playback can `fadeTo(handle, target, duration)`
 * them without per-renderer plumbing.
 *
 * Current overlays:
 *   - milkyWay         — single-quad procedural Milky Way impostor.
 *   - proceduralDisks  — LOD-1 procedural-disk pass (per-galaxy disk
 *                        impostor for the close-approach band).
 *   - texturedImpostors — LOD-2 textured-thumbnail quad pass.
 */
export type OverlayId = 'milkyWay' | 'proceduralDisks' | 'texturedImpostors';
