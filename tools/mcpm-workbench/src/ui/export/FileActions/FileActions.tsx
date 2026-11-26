/**
 * FileActions — the right sidebar's pinned footer: the two exports (trace,
 * .scfd) and the params preset save/load. App mounts it beside the scrolling
 * column rather than in the controls aside, so it is its own landmark and hides
 * with the controls through its own `collapsed`. This component reads the chosen
 * preset file and shows why an import failed.
 */
import { useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import Button from '../../../../../../src/components/common/Button/Button';
import ButtonTip from '../../panel/ButtonTip/ButtonTip';
import CubeIcon from '../../../../../../src/components/icons/CubeIcon/CubeIcon';
import FilamentIcon from '../../../../../../src/components/icons/FilamentIcon/FilamentIcon';
import FloppyIcon from '../../../../../../src/components/icons/FloppyIcon/FloppyIcon';
import FolderOpenIcon from '../../../../../../src/components/icons/FolderOpenIcon/FolderOpenIcon';
import styles from './FileActions.module.css';

export type FileActionsProps = {
  readonly id: string;
  readonly collapsed: boolean;
  readonly onExportTrace: () => void;
  readonly onExportScfd: () => void;
  readonly onSaveParams: () => void;
  /** Applies a preset file's text; throws when the file is not a params preset. */
  readonly onImportParams: (text: string) => void;
};

function FileActions({
  id,
  collapsed,
  onExportTrace,
  onExportScfd,
  onSaveParams,
  onImportParams,
}: FileActionsProps): ReactNode {
  const exportLabelId = useId();
  const paramsLabelId = useId();
  const [paramsError, setParamsError] = useState<string | null>(null);
  const paramsFileInputRef = useRef<HTMLInputElement>(null);

  const onLoadParamsFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ''; // so re-selecting the same file still fires onChange
    if (!file) return;
    void file
      .text()
      .then((text) => {
        onImportParams(text);
        setParamsError(null);
      })
      .catch((err: unknown) => {
        setParamsError((err as Error).message);
      });
  };

  // The visible label is the short word; the accessible name keeps the verb
  // and the group, which the probe and screen readers both rely on.
  return (
    <div
      id={id}
      className={styles.root}
      role="region"
      aria-label="Export and params"
      inert={collapsed}
    >
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
                onClick={onExportTrace}
              >
                <FilamentIcon size={12} />
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
                onClick={onExportScfd}
              >
                <CubeIcon size={12} />
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
            tip="Saves the simulation sliders, agent count, seeding, selection and built-in catalogs as .mcpm.json; not the seed, tier, weighting or view."
            align="center"
          >
            {(describedBy) => (
              <Button
                className={styles.action}
                aria-describedby={describedBy}
                aria-label="save params"
                onClick={() => {
                  onSaveParams();
                  setParamsError(null);
                }}
              >
                <FloppyIcon size={12} />
                <span className={styles.actionLabel}>save</span>
              </Button>
            )}
          </ButtonTip>
          <ButtonTip
            tip="Loads a saved .mcpm.json params file: simulation sliders, agent count, seeding, selection and, if saved, the built-in catalogs."
            align="end"
          >
            {(describedBy) => (
              <Button
                className={styles.action}
                aria-describedby={describedBy}
                aria-label="load params"
                onClick={() => paramsFileInputRef.current?.click()}
              >
                <FolderOpenIcon size={12} />
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
