import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { GalaxyCatalogId } from '../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { FadeId } from '../../../@types/animation/FadeId';
import { FADE_OUT_DURATION_MS } from '../../animation/fadeController';

/**
 * Dissolve one galaxy catalog's currently-drawn buffer — fade its opacity to
 * zero and await the ramp — as the pre-upload half of a tier swap.
 *
 * ## Why this is NOT a `syncVisibilityFades` (intent) call
 *
 * The intent bridge drives a layer toward its settings target (`enabled ? 1 :
 * 0`).  A tier-swap dissolve is the opposite: the catalog stays ENABLED, but
 * we momentarily force it to 0 so the old tier fades out before the buffer is
 * replaced, then the post-upload bridge call fades it back to the (unchanged)
 * intent.  It is a transient presentation effect orthogonal to intent, so it
 * cannot ride the intent bridge — it gets its own named home instead of a raw
 * `fades.fadeTo` buried in the slot commit.
 *
 * ## Why the caller must await it
 *
 * There is one GPU buffer per catalog id, so the old and new tiers can't
 * cross-fade — the dissolve has to FINISH before `renderer.upload()` destroys
 * and recreates the buffer.  Awaiting here, at the commit's pre-upload moment
 * (i.e. after the new `.bin` has already fetched), also keeps the old tier at
 * full alpha throughout the fetch, so there's no blank gap: the user sees the
 * old tier hold, dissolve, then the new tier fade in.
 */
export async function dissolveCatalogBuffer(
  state: Pick<EngineState, 'subsystems'>,
  catalogId: GalaxyCatalogId,
): Promise<void> {
  const id: FadeId = { kind: 'galaxyCatalog', id: catalogId };
  await state.subsystems.fades.fadeTo(id, 0, FADE_OUT_DURATION_MS);
}
