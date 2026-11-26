/**
 * LoadCatalogDialog — the modal the Data section's "Load catalog…" row opens
 * (the owner's ruled exception to ui-ux.md's no-modal rule). Mounted on the
 * sidebar root, never in a foldable body, because it also owns the window drop
 * listener: a file dropped anywhere opens it with that file chosen. The chosen
 * file is previewed in the catalog worker (useCatalogPreview) and Load hands that
 * result on. The store sees only a parsed catalog, so a refused or warned file
 * leaves the loaded one in place. Closing keeps every choice but drops the file
 * from memory, so the backdrop may close it; only Auto fit is on again at every open.
 */
import { useId, useRef, useState, type ReactNode } from 'react';
import type { UserCatalogLoad } from '../../../../@types/catalog/UserCatalogLoad';
import AutoFitField from './AutoFitField/AutoFitField';
import CatalogProblem from './CatalogProblem/CatalogProblem';
import FileField from './FileField/FileField';
import ImportSettingsFields from './ImportSettingsFields/ImportSettingsFields';
import LoadFooter from './LoadFooter/LoadFooter';
import LoadHeader from './LoadHeader/LoadHeader';
import LoadInfo from './LoadInfo/LoadInfo';
import { CATALOG_EXAMPLES } from './data/catalogExamples.constant';
import { useBackdropClose } from './useBackdropClose';
import { useCatalogPreview } from './useCatalogPreview';
import { useChosenCatalogFiles } from './useChosenCatalogFiles';
import { useFocusOnFirstParse } from './useFocusOnFirstParse';
import { useImportFields } from './useImportFields';
import { useModalOpen } from './useModalOpen';
import { useWindowFileDrop } from './useWindowFileDrop';
import { catalogFilesName } from './utils/catalogFilesName';
import { handleFormEnter } from './utils/handleFormEnter';
import { loadProblem } from './utils/loadProblem';
import styles from './LoadCatalogDialog.module.css';

export type LoadCatalogDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The Selection box share Auto fit keeps; the worker fits to it while parsing. */
  readonly autoFitPercent: number;
  readonly onLoad: (load: UserCatalogLoad) => void;
};

function LoadCatalogDialog({
  open,
  onOpenChange,
  autoFitPercent,
  onLoad,
}: LoadCatalogDialogProps): ReactNode {
  const titleId = useId();
  const noteId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const loadRef = useRef<HTMLButtonElement>(null);
  const [autoFit, setAutoFit] = useState(true);
  const { files, refusal, choose, refuse } = useChosenCatalogFiles();
  const packed = files?.kind === 'packed';
  const form = useImportFields(packed);
  const { parsed, preview, current, stale, busy, slowRead, forget } = useCatalogPreview({
    open,
    files,
    settings: form.settings,
    autoFitPercent,
    onRefused: refuse,
  });
  useFocusOnFirstParse(parsed, loadRef);
  const chooseFresh = (chosen: readonly File[]): void => {
    choose(chosen);
    forget();
  };
  useWindowFileDrop((dropped) => {
    chooseFresh(dropped);
    onOpenChange(true);
  });
  useModalOpen(dialogRef, open);
  useBackdropClose(dialogRef);

  const outcome = preview?.outcome ?? null;
  const catalog = outcome !== null && outcome.kind !== 'problem' ? outcome.catalog : null;
  const loadFit = autoFit ? (preview?.fitBounds ?? null) : null;
  const warning = outcome?.kind === 'warning' ? outcome.warning : null;
  const problem = loadProblem(refusal, outcome);
  const filesName = files ? catalogFilesName(files) : null;

  return (
    <dialog
      ref={dialogRef}
      className={styles.root}
      aria-labelledby={titleId}
      aria-describedby={noteId}
      closedby="any"
      onClose={() => {
        forget();
        setAutoFit(true);
        onOpenChange(false);
      }}
    >
      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!current || catalog === null) return;
          onLoad({ catalog, fitBounds: loadFit });
          dialogRef.current?.close();
        }}
        onKeyDown={(e) => handleFormEnter(e, form.wrong, form.checkWrong)}
      >
        <LoadHeader titleId={titleId} noteId={noteId} />

        <div className={styles.body}>
          <div className={styles.fields}>
            <FileField filesName={filesName} onChoose={chooseFresh} />
            <AutoFitField on={autoFit} onChange={setAutoFit} />
            <ImportSettingsFields form={form} packed={packed} warning={warning} stale={stale} />
          </div>

          {problem && (
            <CatalogProblem
              message={problem.message}
              example={problem.showExample ? CATALOG_EXAMPLES[form.fields.formatKind] : null}
            />
          )}
        </div>

        {(files !== null || refusal !== null) && (
          <LoadInfo
            pointCount={catalog?.points.count ?? null}
            bounds={preview?.bounds ?? null}
            weight={preview?.weight ?? null}
            fitBounds={loadFit}
            stale={stale}
          />
        )}

        <LoadFooter
          readingName={slowRead ? filesName : null}
          loadable={current && catalog !== null}
          busy={busy}
          warned={warning !== null}
          loadRef={loadRef}
          onCancel={() => dialogRef.current?.close()}
        />
      </form>
    </dialog>
  );
}

export default LoadCatalogDialog;
