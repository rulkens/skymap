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
import skymapIconUrl from '../../../../../../public/favicon.svg';
import { APP_SOURCE_REGISTRY } from '../../../../../../src/compositions/appSources';
import PlusIcon from '../../../../../../src/components/icons/PlusIcon/PlusIcon';
import { tierTarget } from '../../../../../../src/layers/galaxyCatalog/records/data/tierTargets';
import { deriveGridBox } from '../../../grid/deriveGridBox';
import {
  setCatalogSources,
  setCatalogTier,
  toggleCatalogSource,
  WORKBENCH_SOURCES,
} from '../../../state/catalog/catalogSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import ButtonTip from '../../panel/ButtonTip/ButtonTip';
import CatalogStatus from '../../catalog/CatalogStatus/CatalogStatus';
import SelectionControls from '../../grid/SelectionControls/SelectionControls';
import HistogramReadout from '../../sim/HistogramReadout/HistogramReadout';
import DatabaseIcon from '../../icons/DatabaseIcon/DatabaseIcon';
import GaugeIcon from '../../icons/GaugeIcon/GaugeIcon';
import HistogramIcon from '../../icons/HistogramIcon/HistogramIcon';
import MarqueeIcon from '../../icons/MarqueeIcon/MarqueeIcon';
import LoadCatalogDialog from '../../catalog/LoadCatalogDialog/LoadCatalogDialog';
import PanelRow from '../../panel/PanelRow/PanelRow';
import PanelSection from '../../panel/PanelSection/PanelSection';
import StatsReadout from '../../sim/StatsReadout/StatsReadout';
import StatsSummary from '../../sim/StatsSummary/StatsSummary';
import TierRow from '../../catalog/TierRow/TierRow';
import ToggleRow from '../../panel/ToggleRow/ToggleRow';
import UserCatalogRow from '../../catalog/UserCatalogRow/UserCatalogRow';
import { formatDataSummary } from './utils/formatDataSummary';
import { usePauseSimWhileOpen } from './usePauseSimWhileOpen';
import { formatSelectionSummary } from './utils/formatSelectionSummary';
import styles from './DataPanel.module.css';

export type DataPanelProps = {
  readonly id: string;
  readonly collapsed: boolean;
};

function DataPanel({ id, collapsed }: DataPanelProps): ReactNode {
  const dispatch = useAppDispatch();
  const catalog = useAppSelector((s) => s.catalog);
  const grid = useAppSelector((s) => s.grid);
  const [dataOpen, setDataOpen] = useState(true);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [histogramOpen, setHistogramOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  usePauseSimWhileOpen(dialogOpen);

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
          <PanelSection
            title="Data"
            icon={<DatabaseIcon size={12} />}
            open={dataOpen}
            onToggle={() => setDataOpen((v) => !v)}
            summary={formatDataSummary(
              catalog.sources.length,
              catalog.userCatalog !== null && catalog.userCatalogOn,
            )}
          >
            <UserCatalogRow />
            <PanelRow>
              <ButtonTip tip="Opens a catalog file from this computer; it is read here, not uploaded.">
                {(describedBy) => (
                  <button
                    type="button"
                    className={styles.addRow}
                    aria-describedby={describedBy}
                    onClick={() => setDialogOpen(true)}
                  >
                    <PlusIcon size={12} />
                    Load catalog…
                  </button>
                )}
              </ButtonTip>
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
            icon={<MarqueeIcon size={12} />}
            open={selectionOpen}
            onToggle={() => setSelectionOpen((v) => !v)}
            summary={formatSelectionSummary(deriveGridBox(grid).sizeMpc)}
          >
            <SelectionControls />
          </PanelSection>
        </div>
        <div className={styles.pinned}>
          <CatalogStatus />
          <PanelSection
            title="Stats"
            icon={<GaugeIcon size={12} />}
            open={statsOpen}
            onToggle={() => setStatsOpen((v) => !v)}
            summary={<StatsSummary />}
          >
            <StatsReadout />
          </PanelSection>
          <PanelSection
            title="Histogram"
            icon={<HistogramIcon size={12} />}
            open={histogramOpen}
            onToggle={() => setHistogramOpen((v) => !v)}
          >
            <HistogramReadout />
          </PanelSection>
        </div>
      </aside>
      <LoadCatalogDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

export default DataPanel;
