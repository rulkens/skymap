/**
 * Size — plain `{ width, height }` pair, used by `PostProcess.resize`.
 *
 * We deliberately don't reuse a DOM type like `DOMRectReadOnly` — those
 * carry extra fields (x, y, top, ...) the GPU descriptor doesn't want,
 * and the pinhole-explicit name makes the resize call site
 * (`resize({ width, height })`) read like English.
 */
export type Size = { readonly width: number; readonly height: number };
