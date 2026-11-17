/**
 * lookFontsAsked — the engines `loadLookFonts` has already fetched for, so a
 * frame-loop caller asks once. Keyed by engine state: a second engine instance
 * asks for itself.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';

export const lookFontsAsked = new WeakSet<EngineState>();
