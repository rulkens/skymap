/**
 * DataPanel — the left sidebar, what goes into the simulation: the tool's
 * title, the catalogs (a loaded file, then the tier over the built-ins it
 * applies to), the Selection box that cuts the simulated part out of them,
 * and pinned below them Stats and Histogram, which fold like the rest and give
 * their height back to the scrolling sections. The import dialog is mounted
 * here, so its drop listener lives while Data is folded or the sidebar
 * collapsed, and beside the aside, outside the collapsed sidebar's `inert`.
 */
import { useState, type ReactNode } from 'react';
import skymapIconUrl from '../../../../../public/favicon.svg';
import { APP_SOURCE_REGISTRY } from '../../../../../src/compositions/appSources';
import PlusIcon from '../../../../../src/components/icons/PlusIcon/PlusIcon';
import { tierTarget } from '../../../../../src/layers/galaxyCatalog/records/data/tierTargets';
import {
  setCatalogSources,
  setCatalogTier,
  toggleCatalogSource,
  WORKBENCH_SOURCES,
} from '../../state/catalog/catalogSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import CatalogStatus from '../CatalogStatus/CatalogStatus';
import GridBoxPanel from '../GridBoxPanel/GridBoxPanel';
import HistogramDock from '../HistogramDock/HistogramDock';
import LoadCatalogDialog from '../LoadCatalogDialog/LoadCatalogDialog';
import PanelRow from '../PanelRow/PanelRow';
import PanelSection from '../PanelSection/PanelSection';
import StatsReadout from '../StatsReadout/StatsReadout';
import TierRow from '../TierRow/TierRow';
import ToggleRow from '../ToggleRow/ToggleRow';
import UserCatalogRow from '../UserCatalogRow/UserCatalogRow';
import styles from './DataPanel.module.css';

export type DataPanelProps = {
  readonly id: string;
  readonly collapsed: boolean;
};

function DataPanel({ id, collapsed }: DataPanelProps): ReactNode {
  const dispatch = useAppDispatch();
  const catalog = useAppSelector((s) => s.catalog);
  const [dataOpen, setDataOpen] = useState(true);
  const [selectionOpen, setSelectionOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(true);
  const [histogramOpen, setHistogramOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <aside id={id} className={styles.root} aria-label="Data" inert={collapsed}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            <img className={styles.icon} src={skymapIconUrl} alt="" aria-hidden />
            MCPM Workbench
          </h1>
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
            <TierRow tier={catalog.tier} onChange={(t) => dispatch(setCatalogTier(t))} />
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
          </PanelSection>
          <PanelSection
            title="Selection"
            open={selectionOpen}
            onToggle={() => setSelectionOpen((v) => !v)}
          >
            <GridBoxPanel />
          </PanelSection>
        </div>
        <div className={styles.pinned}>
          <CatalogStatus />
          <PanelSection title="Stats" open={statsOpen} onToggle={() => setStatsOpen((v) => !v)}>
            <StatsReadout />
          </PanelSection>
          <PanelSection
            title="Histogram"
            open={histogramOpen}
            onToggle={() => setHistogramOpen((v) => !v)}
          >
            <HistogramDock />
          </PanelSection>
        </div>
      </aside>
      <LoadCatalogDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

export default DataPanel;
