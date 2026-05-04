/**
 * MousePos — a CSS-pixel mouse position record used by the throttled
 * hover-pick pipeline.
 *
 * ### Why a named type?
 *
 * The engine compares the latest pointermove position against the last
 * one it actually issued a pick for, and only re-runs picking when they
 * differ.  That dedupe is one of the cheapest knobs we have for keeping
 * the GPU pick pass off the critical path while the user is hovering
 * inside a single galaxy's silhouette.  Having a named type for the
 * pair (rather than two free `number` fields on `EnginePickingState`)
 * makes the comparison reads ("are these two MousePos equal?") obvious
 * at the call site.
 *
 * ### Why CSS pixels (and not device / texture pixels)?
 *
 * The engine receives `pointerevent.clientX/Y` in CSS pixels — the same
 * coordinate space the canvas uses for its `style.width/height`.  The
 * pick texture lives in device pixels, so the actual `copyTextureToBuffer`
 * coords are derived just-in-time inside the click resolver via the
 * `cssToTexPx` helper.  Storing the canonical mouse position in CSS
 * pixels keeps the pick code path symmetric with browser input.
 *
 * ### Naming
 *
 * "MousePos" rather than "PointerPos" because the rest of the engine's
 * picking glossary (mouse-down, mouse-css, etc.) was already locked
 * into the `mouse*` prefix when this got named, and renaming through
 * the whole engine wasn't worth the churn.  Both pointer and mouse
 * events flow through this same type.
 */
export type MousePos = { x: number; y: number };
