/**
 * ParamSpecEntry — one slider's range: `[min, max, step]` from the spike's
 * `SPEC` table (`Galaxy Renderer.dc.html`), reshaped from a tuple
 * into named fields. `paramSpec.ts`'s `PARAM_SPEC` is the ONLY place these
 * ranges live — both the slider UI and the randomizer read from it, so a
 * range never has to be kept in sync across two call sites.
 */

export type ParamSpecEntry = { readonly min: number; readonly max: number; readonly step: number };
