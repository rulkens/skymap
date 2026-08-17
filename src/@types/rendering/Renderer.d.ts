/**
 * Renderer — the minimum contract every renderer in `services/gpu/renderers/`
 * satisfies.
 *
 * ### Why this lives at the type level
 *
 * Pre-Option-A every renderer had its own narrow type (`GalaxyPointRenderer`,
 * `FilamentRenderer`, etc.).  The engine's destroy path had to enumerate
 * each one by name, and there was no compile-time guarantee that a new
 * renderer included a `destroy()` method.  This type makes those two
 * things explicit:
 *
 *   - `destroy()` is a compile-time obligation — adding a renderer that
 *     forgets cleanup is a type error.
 *   - `label` is a human-readable identifier useful for devtools
 *     logging, GPU-profiler attribution, and future debug overlays.
 *     The convention is the renderer's factory name without `create`
 *     (e.g. `createGalaxyPointRenderer` → `'galaxyPointRenderer'`).
 *
 * ### Why not include `draw()`?
 *
 * Draw signatures vary wildly across renderers — `galaxyPointRenderer.draw`
 * takes a `GalaxyPointDrawSettings` record, `galaxyPickRenderer.drawPoints` records
 * into a caller-owned pick pass, `volumeFieldRenderer.draw` reads from a
 * `FrameContext`.  A common base would either force a
 * lowest-common-denominator signature (hurting type clarity) or use a
 * union that's no narrower than the per-renderer types.  Each renderer
 * keeps its own `draw`/`pick`/`upload` shape.
 *
 * See `docs/superpowers/audits/2026-05-11-renderer-state-audit.md` for
 * the full per-renderer breakdown that informed this contract.
 */
export type Renderer = {
  /** Human-readable identifier (e.g. `'galaxyPointRenderer'`). */
  readonly label: string;
  /** Release every GPU resource this renderer owns. */
  destroy(): void;
};
