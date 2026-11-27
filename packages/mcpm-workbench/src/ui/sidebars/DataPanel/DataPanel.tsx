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
import type { Tier } from '../../../../../shared/src/@types/data/Tier';
import type { Vec3 } from '../../../../../shared/src/@types/math/Vec3';
import { APP_SOURCE_REGISTRY } from '../../../../../../src/compositions/appSources';
import PlusIcon from '../../../../../shared/src/components/icons/PlusIcon/PlusIcon';
import type { GalaxyCatalogId } from '../../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import { tierTarget } from '../../../../../../src/layers/galaxyCatalog/records/data/tierTargets';
import { WORKBENCH_SOURCES } from '../../../catalog/workbenchSources.constant';
import CatalogStatusContainer from '../../containers/catalog/CatalogStatusContainer';
import LoadCatalogDialogContainer from '../../containers/catalog/LoadCatalogDialogContainer';
import UserCatalogRowContainer from '../../containers/catalog/UserCatalogRowContainer';
import SelectionControlsContainer from '../../containers/grid/SelectionControlsContainer';
import HistogramReadoutContainer from '../../containers/sim/HistogramReadoutContainer';
import StatsReadoutContainer from '../../containers/sim/StatsReadoutContainer';
import StatsSummaryContainer from '../../containers/sim/StatsSummaryContainer';
import TierRow from '../../catalog/TierRow/TierRow';
import DatabaseIcon from '../../../../../../src/components/icons/DatabaseIcon/DatabaseIcon';
import GaugeIcon from '../../../../../../src/components/icons/GaugeIcon/GaugeIcon';
import HistogramIcon from '../../../../../../src/components/icons/HistogramIcon/HistogramIcon';
import MarqueeIcon from '../../../../../../src/components/icons/MarqueeIcon/MarqueeIcon';
import ButtonTip from '../../panel/ButtonTip/ButtonTip';
import PanelRow from '../../panel/PanelRow/PanelRow';
import PanelSection from '../../panel/PanelSection/PanelSection';
import ToggleRow from '../../panel/ToggleRow/ToggleRow';
import { formatDataSummary } from './utils/formatDataSummary';
import { formatSelectionSummary } from './utils/formatSelectionSummary';
import styles from './DataPanel.module.css';

export type DataPanelProps = {
  readonly id: string;
  readonly collapsed: boolean;
  readonly tier: Tier;
  readonly sources: readonly GalaxyCatalogId[];
  /** A file is loaded and switched on. */
  readonly userCatalogOn: boolean;
  readonly selectionSizeMpc: Vec3;
  readonly onTierChange: (tier: Tier) => void;
  readonly onSourceToggle: (source: GalaxyCatalogId, on: boolean) => void;
};

function DataPanel({
  id,
  collapsed,
  tier,
  sources,
  userCatalogOn,
  selectionSizeMpc,
  onTierChange,
  onSourceToggle,
}: DataPanelProps): ReactNode {
  const [dataOpen, setDataOpen] = useState(true);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [histogramOpen, setHistogramOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <aside id={id} className={styles.root} aria-label="Data" inert={collapsed}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            <img className={styles.icon} src={skymapIconUrl} alt="" />
            MCPM Workbench
          </h1>
        </header>
        <div className={styles.sections}>
          <PanelSection
            title="Data"
            icon={<DatabaseIcon size={12} />}
            open={dataOpen}
            onToggle={() => setDataOpen((v) => !v)}
            summary={formatDataSummary(sources.length, userCatalogOn)}
          >
            <UserCatalogRowContainer />
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
            <TierRow tier={tier} onChange={onTierChange} />
            {WORKBENCH_SOURCES.map((s) => (
              <ToggleRow
                key={s}
                label={APP_SOURCE_REGISTRY[s].label}
                on={sources.includes(s)}
                // Excluded at the current tier (e.g. SDSS at 'small') carries no bin for
                // this tier, but selection must survive a tier switch — mute + hint, never
                // disable.
                hint={tierTarget(s, tier) === 0 ? `not in ${tier} tier` : undefined}
                onChange={(on) => onSourceToggle(s, on)}
              />
            ))}
          </PanelSection>
          <PanelSection
            title="Selection"
            icon={<MarqueeIcon size={12} />}
            open={selectionOpen}
            onToggle={() => setSelectionOpen((v) => !v)}
            summary={formatSelectionSummary(selectionSizeMpc)}
          >
            <SelectionControlsContainer />
          </PanelSection>
        </div>
        <div className={styles.pinned}>
          <CatalogStatusContainer />
          <PanelSection
            title="Stats"
            icon={<GaugeIcon size={12} />}
            open={statsOpen}
            onToggle={() => setStatsOpen((v) => !v)}
            summary={<StatsSummaryContainer />}
          >
            <StatsReadoutContainer />
          </PanelSection>
          <PanelSection
            title="Histogram"
            icon={<HistogramIcon size={12} />}
            open={histogramOpen}
            onToggle={() => setHistogramOpen((v) => !v)}
          >
            <HistogramReadoutContainer />
          </PanelSection>
        </div>
      </aside>
      <LoadCatalogDialogContainer open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

export default DataPanel;
