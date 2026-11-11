import { useAppSelector } from '../../../../store/hooks';
import { selectFamousGalaxiesMeta } from '../../../../state/engine/selectors';
import type { GalaxyInfo } from '../../records/@types/GalaxyInfo';
import type { FamousGalaxyMetaEntry } from '../../../../@types/loading/FamousGalaxyMetaEntry';

/**
 * A famous galaxy's sidecar entry, by its compiled-in id, off the Layer's `famousMeta` fact;
 * undefined for a survey galaxy and until the sidecar lands. A store read, not a row field,
 * so the card's prose arrives with the sidecar however early the card opened.
 */
export function useFamousGalaxyMeta(target: GalaxyInfo): FamousGalaxyMetaEntry | undefined {
  const meta = useAppSelector(selectFamousGalaxiesMeta);
  const id = target.famous?.id;
  return id === undefined ? undefined : meta.find((entry) => entry.id === id);
}
