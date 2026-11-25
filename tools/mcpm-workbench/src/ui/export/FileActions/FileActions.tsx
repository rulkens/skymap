/**
 * FileActions — the right sidebar's pinned footer: the two exports (trace,
 * .scfd) and the params preset save/load. App mounts it beside the scrolling
 * column rather than in the controls aside, so it hides with the controls
 * through its own `collapsed`. The exports only request; the export
 * saga's harness closure is the one place that can read the trace back. The
 * params preset is the same shape the trace sidecar's provenance.params rides
 * (exportParams), so it saves synchronously from the live store.
 */
import { useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import Button from '../../../../../../src/components/common/Button/Button';
import { downloadStem } from '../../../export/downloadStem';
import { triggerDownload } from '../../../export/triggerDownload';
import { deriveGridBox } from '../../../grid/deriveGridBox';
import { setCatalogSources } from '../../../state/catalog/catalogSlice';
import { exportNpyRequested, exportScfdRequested } from '../../../state/commands';
import { exportParams, MCPM_PARAM_KEYS } from '../../../params/exportParams';
import { installImportedBox } from '../../../state/grid/gridSlice';
import { importParams } from '../../../params/importParams';
import { setAgentCount, setInitMode, setSimParam } from '../../../state/sim/simSlice';
import { useAppDispatch, useAppStore } from '../../../store/hooks';
import ButtonTip from '../../panel/ButtonTip/ButtonTip';
import CubeIcon from '../../icons/CubeIcon/CubeIcon';
import FilamentIcon from '../../icons/FilamentIcon/FilamentIcon';
import FloppyIcon from '../../icons/FloppyIcon/FloppyIcon';
import FolderOpenIcon from '../../icons/FolderOpenIcon/FolderOpenIcon';
import styles from './FileActions.module.css';
import { PARAMS_FILE_EXTENSION } from './data/paramsFileExtension.constant';

const ICON_SIZE = 12;

export type FileActionsProps = {
  readonly collapsed: boolean;
};

function FileActions({ collapsed }: FileActionsProps): ReactNode {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const exportLabelId = useId();
  const paramsLabelId = useId();
  const [paramsError, setParamsError] = useState<string | null>(null);
  const paramsFileInputRef = useRef<HTMLInputElement>(null);

  const onSaveParams = (): void => {
    const s = store.getState();
    const json = exportParams({
      params: s.sim.params,
      agentCount: s.sim.agentCount,
      initMode: s.sim.initMode,
      gridBox: deriveGridBox(s.grid),
      sources: s.catalog.sources,
    });
    triggerDownload(
      `${downloadStem(new Date())}${PARAMS_FILE_EXTENSION}`,
      json,
      'application/json',
    );
    setParamsError(null);
  };

  const onLoadParamsFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ''; // so re-selecting the same file still fires onChange
    if (!file) return;
    void file
      .text()
      .then((text) => {
        const imported = importParams(text);
        // Dispatch order is free: every structural trigger lands in one debounced
        // rebuild that reads a fresh state snapshot. setSimParam is live, no rebuild.
        for (const key of MCPM_PARAM_KEYS)
          dispatch(setSimParam({ key, value: imported.params[key] }));
        dispatch(setInitMode(imported.initMode));
        dispatch(setAgentCount(imported.agentCount));
        dispatch(installImportedBox(imported.gridBox));
        if (imported.sources !== undefined) dispatch(setCatalogSources(imported.sources));
        setParamsError(null);
      })
      .catch((err: unknown) => {
        setParamsError((err as Error).message);
      });
  };

  // The visible label is the short word; the accessible name keeps the verb
  // and the group, which the probe and screen readers both rely on.
  return (
    <div className={styles.root} inert={collapsed}>
      <div className={styles.group} role="group" aria-labelledby={exportLabelId}>
        <span id={exportLabelId} className={styles.groupLabel}>
          export
        </span>
        <div className={styles.pair}>
          <ButtonTip
            tip="Downloads the trace as a .npy volume and its .json sidecar, for the build pipeline."
            align="center"
          >
            {(describedBy) => (
              <Button
                className={styles.action}
                aria-describedby={describedBy}
                aria-label="download trace"
                onClick={() => dispatch(exportNpyRequested())}
              >
                <FilamentIcon size={ICON_SIZE} />
                <span className={styles.actionLabel}>trace</span>
              </Button>
            )}
          </ButtonTip>
          <ButtonTip
            tip="Downloads the trace packed as a .scfd scalar field, the volume format Skymap draws."
            align="end"
          >
            {(describedBy) => (
              <Button
                className={styles.action}
                aria-describedby={describedBy}
                aria-label="download .scfd"
                onClick={() => dispatch(exportScfdRequested())}
              >
                <CubeIcon size={ICON_SIZE} />
                <span className={styles.actionLabel}>.scfd</span>
              </Button>
            )}
          </ButtonTip>
        </div>
      </div>
      <div className={styles.group} role="group" aria-labelledby={paramsLabelId}>
        <span id={paramsLabelId} className={styles.groupLabel}>
          params
        </span>
        <div className={styles.pair}>
          <ButtonTip
            tip="Saves the simulation sliders, agent count, seeding, grid box and built-in catalogs as .mcpm.json; not the seed, tier, weighting or view."
            align="center"
          >
            {(describedBy) => (
              <Button
                className={styles.action}
                aria-describedby={describedBy}
                aria-label="save params"
                onClick={onSaveParams}
              >
                <FloppyIcon size={ICON_SIZE} />
                <span className={styles.actionLabel}>save</span>
              </Button>
            )}
          </ButtonTip>
          <ButtonTip
            tip="Loads a saved .mcpm.json params file: simulation sliders, agent count, seeding, grid box and, if saved, the built-in catalogs."
            align="end"
          >
            {(describedBy) => (
              <Button
                className={styles.action}
                aria-describedby={describedBy}
                aria-label="load params"
                onClick={() => paramsFileInputRef.current?.click()}
              >
                <FolderOpenIcon size={ICON_SIZE} />
                <span className={styles.actionLabel}>load</span>
              </Button>
            )}
          </ButtonTip>
        </div>
        <input
          ref={paramsFileInputRef}
          type="file"
          accept="application/json,.json"
          aria-label="load params file"
          hidden
          onChange={onLoadParamsFile}
        />
      </div>
      {paramsError && (
        <p className={styles.error} role="alert">
          {paramsError}
        </p>
      )}
    </div>
  );
}

export default FileActions;
