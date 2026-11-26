/**
 * FilmLook — the film grade as the compositor draws it this frame: the knobs
 * plus a per-frame grain seed (`EngineState.frameIndex`), so the compositor
 * holds no counter of its own.
 */

import type { FilmGrade } from '../settings/FilmGrade';

export type FilmLook = { readonly grade: FilmGrade; readonly seed: number };
