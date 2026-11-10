import { useMemo } from 'react';
import { useAppSelector } from '../../../../../src/store/hooks';
import {
  selectAliasIndex,
  selectFamousGalaxiesMeta,
  selectLayerSearchRows,
  selectStructureSearchList,
} from '../../../../../src/state/engine/selectors';
import { selectRefNames } from '../state/selectors';
import type { ObjectIndex } from '../../@types/kinds/ObjectIndex';

/** The command palette's own index reads, so the studio searches and names objects as the app does. */
export function useObjectIndex(): ObjectIndex {
  const famous = useAppSelector(selectFamousGalaxiesMeta);
  const aliases = useAppSelector(selectAliasIndex);
  const structures = useAppSelector(selectStructureSearchList);
  const layerRows = useAppSelector(selectLayerSearchRows);
  const refNames = useAppSelector(selectRefNames);
  return useMemo(
    () => ({ famous, aliases, structures, layerRows, refNames }),
    [famous, aliases, structures, layerRows, refNames],
  );
}
