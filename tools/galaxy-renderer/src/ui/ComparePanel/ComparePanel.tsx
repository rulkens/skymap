/**
 * ComparePanel — the "validation mode" reference panel: pick a real named
 * galaxy, load its parameter preset, match the camera to its published pose,
 * and — photo permitting — auto-fit the live render against the reference
 * photo via `runCompareFit`.
 *
 * Holds the one thing `runCompareFit` needs that isn't already in the
 * store: the live `engine` handle (forwarded from `App`, itself forwarded
 * from `Viewport.onEngine`) and a per-session descriptor cache. The cache
 * is a module-level `Map`, not component state — `runCompareFit` reads and
 * writes it directly across repeated fits against the same reference
 * (`descriptorCache` in its own signature), and module scope is
 * the simplest thing that survives a re-render without promoting a
 * fit-run memo into store state nothing else needs.
 *
 * The Milky Way reference has no external photograph (`ref.img === null`):
 * the spike's `applyRef`/`autoFit` would run straight into a broken
 * `url(null)` background-image or a thrown `loadImageDescriptor` error.
 * This port never reaches either — the image card swaps in a model-only
 * note, and the fit button is disabled with an explanatory hint instead.
 */
import type { ReactNode } from 'react';
import cx from 'classnames';
import type { GalaxyEngineHandle } from '../../../@types/engine/GalaxyEngineHandle';
import type { GalaxyDescriptor } from '../../../@types/matcher/GalaxyDescriptor';
import Button from '../../../../../src/components/common/Button/Button';
import { useAppDispatch, useAppSelector, useAppStore } from '../../state/hooks';
import {
  referenceSelected,
  viewRequested,
  fitStopRequested,
} from '../../state/slices/compareSlice';
import { paramsPatched } from '../../state/slices/galaxySlice';
import { REFERENCE_GALAXIES } from '../../data/referenceGalaxies';
import { runCompareFit } from '../../state/runCompareFit';
import styles from './ComparePanel.module.css';

export type ComparePanelProps = {
  readonly engine: GalaxyEngineHandle | null;
};

// Per-session memo keyed by reference id — outlives any single fit run and
// any re-render of this component.
const descriptorCache = new Map<string, GalaxyDescriptor>();

const SCORE_GOOD = 78;
const SCORE_WARN = 55;

function scoreClass(score: number | null): string | undefined {
  if (score === null) return styles.scoreNeutral;
  if (score >= SCORE_GOOD) return styles.scoreGood;
  if (score >= SCORE_WARN) return styles.scoreWarn;
  return styles.scoreBad;
}

function ComparePanel({ engine }: ComparePanelProps): ReactNode {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const galaxy = useAppSelector((state) => state.galaxy);
  const compare = useAppSelector((state) => state.compare);
  const active = REFERENCE_GALAXIES.find((ref) => ref.id === compare.activeId);
  if (!active) {
    throw new Error(`ComparePanel: no reference galaxy for activeId '${compare.activeId}'`);
  }

  const handleLoadPreset = (): void => {
    dispatch(paramsPatched({ ...galaxy, ...active.params }));
    dispatch(viewRequested(active.view));
  };

  const handleMatchView = (): void => {
    dispatch(viewRequested(active.view));
  };

  const fitDisabled = !engine || active.img === null || compare.fitting;

  const handleAutoFit = (): void => {
    if (fitDisabled || !engine) return;
    void runCompareFit({
      engine,
      reference: active,
      seedParams: { ...galaxy, ...active.params },
      store,
      descriptorCache,
    });
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>VALIDATION MODE</div>
        <div className={styles.headline}>Real galaxy reference</div>
        <div className={styles.headerBody}>
          Compare the live render (right) against real astrophotography. Load a preset, then match
          the viewing angle.
        </div>
      </div>

      <div className={styles.chips}>
        {REFERENCE_GALAXIES.map((ref) => (
          <button
            key={ref.id}
            type="button"
            className={cx(styles.chip, ref.id === active.id && styles.chipActive)}
            onClick={() => dispatch(referenceSelected(ref.id))}
          >
            {ref.short}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        <div className={styles.imageCard}>
          {active.img !== null ? (
            <img className={styles.image} src={active.img} alt={active.name} />
          ) : (
            <div className={styles.noPhoto}>model only — no external photograph exists</div>
          )}
          <div className={styles.credit}>📷 {active.credit}</div>
        </div>

        <div className={styles.name}>{active.name}</div>
        <div className={styles.type}>{active.hubbleType}</div>

        <div className={styles.facts}>
          <div className={styles.fact}>
            <div className={styles.factLabel}>DISTANCE</div>
            <div className={styles.factValue}>{active.dist}</div>
          </div>
          <div className={styles.fact}>
            <div className={styles.factLabel}>DIAMETER</div>
            <div className={styles.factValue}>{active.diam}</div>
          </div>
          <div className={styles.fact}>
            <div className={styles.factLabel}>SPIRAL ARMS</div>
            <div className={styles.factValue}>{active.arms}</div>
          </div>
          <div className={styles.fact}>
            <div className={styles.factLabel}>VIEWED</div>
            <div className={styles.factValue}>{active.viewLabel}</div>
          </div>
        </div>

        <div className={styles.notable}>{active.notable}</div>

        <div className={styles.actions}>
          <Button variant="primary" className={styles.loadButton} onClick={handleLoadPreset}>
            Load preset →
          </Button>
          <Button className={styles.matchButton} onClick={handleMatchView}>
            Match view
          </Button>
        </div>

        <div className={styles.fitSection}>
          <div className={styles.fitHead}>
            <span className={styles.eyebrow}>AUTO-FIT PIPELINE</span>
            <span className={cx(styles.score, scoreClass(compare.fitScore))}>
              {compare.fitScore === null ? '—' : `${compare.fitScore}%`}
            </span>
          </div>
          <div className={styles.fitBody}>
            Extracts scale- and rotation-invariant descriptors (radial profile, arm harmonics, axis
            ratio, dust) from the photo and hill-climbs the parameters to minimise the difference.
          </div>
          <Button className={styles.fitButton} disabled={fitDisabled} onClick={handleAutoFit}>
            {compare.fitting ? 'Fitting…' : '⚙ Auto-fit render to photo'}
          </Button>
          {active.img === null && <div className={styles.noPhotoHint}>no photo — model only</div>}

          {compare.fitting && (
            <div className={styles.progressBlock}>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${Math.round(compare.fitProgress * 100)}%` }}
                />
              </div>
              <div className={styles.progressRow}>
                <span>{compare.fitNote}</span>
                <button
                  type="button"
                  className={styles.stopButton}
                  onClick={() => dispatch(fitStopRequested())}
                >
                  ■ stop
                </button>
              </div>
            </div>
          )}

          {compare.report && (
            <div className={styles.report}>
              <div className={styles.reportHeader}>MATCH REPORT · photo → render</div>
              <div className={styles.reportRow}>
                <span>dominant arms</span>
                <span className={styles.reportValue}>
                  {compare.report.armsRef} → {compare.report.armsRen}
                </span>
              </div>
              <div className={styles.reportRow}>
                <span>axis ratio q</span>
                <span className={styles.reportValue}>
                  {compare.report.qRef.toFixed(2)} → {compare.report.qRen.toFixed(2)}
                </span>
              </div>
              <div className={styles.reportRow}>
                <span>dust index</span>
                <span className={styles.reportValue}>
                  {compare.report.dustRef.toFixed(2)} → {compare.report.dustRen.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ComparePanel;
