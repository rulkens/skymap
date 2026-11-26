/**
 * DataPanelContainer — store boundary for the left sidebar: the tier and the built-in
 * catalogs it switches, whether a loaded file is on, and the Selection box's size for
 * its folded summary. The sidebar's rows that read more own their containers.
 */
import { memo, useCallback, type ReactNode } from 'react';
import type { Tier } from '../../../../../../src/@types/data/Tier';
import type { GalaxyCatalogId } from '../../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import { deriveGridBox } from '../../../grid/deriveGridBox';
import {
  setCatalogSources,
  setCatalogTier,
  toggleCatalogSource,
} from '../../../state/catalog/catalogSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import DataPanel, { type DataPanelProps } from '../../sidebars/DataPanel/DataPanel';

export type DataPanelContainerProps = Pick<DataPanelProps, 'id' | 'collapsed'>;

function DataPanelContainer({ id, collapsed }: DataPanelContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const tier = useAppSelector((s) => s.catalog.tier);
  const sources = useAppSelector((s) => s.catalog.sources);
  const userCatalogOn = useAppSelector(
    (s) => s.catalog.userCatalog !== null && s.catalog.userCatalogOn,
  );
  const grid = useAppSelector((s) => s.grid);
  const onTierChange = useCallback((t: Tier) => dispatch(setCatalogTier(t)), [dispatch]);
  const onSourceToggle = useCallback(
    (source: GalaxyCatalogId, on: boolean) =>
      dispatch(setCatalogSources(toggleCatalogSource(sources, source, on))),
    [dispatch, sources],
  );
  return (
    <DataPanel
      id={id}
      collapsed={collapsed}
      tier={tier}
      sources={sources}
      userCatalogOn={userCatalogOn}
      selectionSizeMpc={deriveGridBox(grid).sizeMpc}
      onTierChange={onTierChange}
      onSourceToggle={onSourceToggle}
    />
  );
}

export default memo(DataPanelContainer);
