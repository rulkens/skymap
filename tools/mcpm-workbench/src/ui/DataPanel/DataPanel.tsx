/**
 * DataPanel — the left sidebar, what goes into the simulation: the tool's
 * title, the catalogs (a loaded file, the built-ins, the tier), and pinned
 * below them the stats and histogram. The import dialog is mounted here, at
 * the sidebar root, so its window drop listener lives while Data is folded.
 */
import { useState, type ReactNode } from 'react';
import { APP_SOURCE_REGISTRY } from '../../../../../src/compositions/appSources';
import PlusIcon from '../../../../../src/components/icons/PlusIcon/PlusIcon';
import { TierChip } from '../../../../../src/components/SettingsPanel/TierChip';
import { tierTarget } from '../../../../../src/layers/galaxyCatalog/records/data/tierTargets';
import {
  setCatalogSources,
  setCatalogTier,
  toggleCatalogSource,
  WORKBENCH_SOURCES,
} from '../../state/catalog/catalogSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import CatalogStatus from '../CatalogStatus/CatalogStatus';
import HistogramDock from '../HistogramDock/HistogramDock';
import LoadCatalogDialog from '../LoadCatalogDialog/LoadCatalogDialog';
import PanelRow from '../PanelRow/PanelRow';
import PanelSection from '../PanelSection/PanelSection';
import StatsReadout from '../StatsReadout/StatsReadout';
import ToggleRow from '../ToggleRow/ToggleRow';
import UserCatalogRow from '../UserCatalogRow/UserCatalogRow';
import styles from './DataPanel.module.css';

function DataPanel(): ReactNode {
  const dispatch = useAppDispatch();
  const catalog = useAppSelector((s) => s.catalog);
  const [dataOpen, setDataOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <aside className={styles.root} aria-label="Data">
      <header className={styles.header}>
        <h1 className={styles.title}>MCPM Workbench</h1>
      </header>
      <div className={styles.sections}>
        <PanelSection title="Data" open={dataOpen} onToggle={() => setDataOpen((v) => !v)}>
          <UserCatalogRow />
          <PanelRow>
            <button type="button" className={styles.addRow} onClick={() => setDialogOpen(true)}>
              <PlusIcon size={12} />
              Load catalog…
            </button>
          </PanelRow>
          {WORKBENCH_SOURCES.map((s) => (
            <ToggleRow
              key={s}
              label={APP_SOURCE_REGISTRY[s].label}
              on={catalog.sources.includes(s)}
              // Excluded at the current tier (e.g. SDSS at 'small') carries no bin for
              // this tier, but selection must survive a tier switch — mute + hint, never
              // disable.
              hint={tierTarget(s, catalog.tier) === 0 ? `not in ${catalog.tier} tier` : undefined}
              onChange={(on) =>
                dispatch(setCatalogSources(toggleCatalogSource(catalog.sources, s, on)))
              }
            />
          ))}
          <PanelRow>
            <TierChip tier={catalog.tier} onTierChange={(t) => dispatch(setCatalogTier(t))} />
          </PanelRow>
        </PanelSection>
      </div>
      <div className={styles.pinned}>
        <CatalogStatus />
        <h2 className={styles.heading}>Stats</h2>
        <StatsReadout />
        <h2 className={styles.heading}>Histogram</h2>
        <HistogramDock />
      </div>
      <LoadCatalogDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </aside>
  );
}

export default DataPanel;
