/**
 * LoadCatalogDialog — the Data section's "Load catalog" button and the modal
 * it opens (the owner's ruled exception to ui-ux.md's no-modal rule). A file
 * dropped anywhere on the page opens it with that file chosen. Files are read
 * and parsed in the page; the store sees only a parsed catalog, so a refused
 * or warned load leaves the loaded one in place.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { CatalogFiles } from '../../../@types/CatalogFiles';
import type { CatalogImportSettings } from '../../../@types/CatalogImportSettings';
import type { CatalogLoadOutcome } from '../../../@types/CatalogLoadOutcome';
import type { UserCatalog } from '../../../@types/UserCatalog';
import Button from '../../../../../src/components/common/Button/Button';
import { userCatalogLoaded } from '../../state/catalog/catalogSlice';
import { useAppDispatch } from '../../store/hooks';
import ChoiceGroup from '../ChoiceGroup/ChoiceGroup';
import PanelRow from '../PanelRow/PanelRow';
import { CATALOG_EXAMPLES } from './utils/CATALOG_EXAMPLES';
import { catalogFilesName } from './utils/catalogFilesName';
import { FORMAT_CHOICES } from './utils/FORMAT_CHOICES';
import { parseCatalogFiles } from './utils/parseCatalogFiles';
import { readCatalogFiles } from './utils/readCatalogFiles';
import { SLOW_READ_MS } from './utils/SLOW_READ_MS';
import { WEIGHT_CHOICES } from './utils/WEIGHT_CHOICES';
import styles from './LoadCatalogDialog.module.css';

function LoadCatalogDialog(): ReactNode {
  const dispatch = useAppDispatch();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<CatalogFiles | null>(null);
  const [formatKind, setFormatKind] =
    useState<CatalogImportSettings['format']['kind']>('cartesianMpc');
  const [h0, setH0] = useState('70');
  const [omegaM, setOmegaM] = useState('0.315');
  const [weightKind, setWeightKind] = useState<CatalogImportSettings['weight']['kind']>('linear');
  const [scale, setScale] = useState('1');
  const [outcome, setOutcome] = useState<Exclude<CatalogLoadOutcome, { kind: 'ready' }> | null>(
    null,
  );
  const [reading, setReading] = useState(false);
  const [slowRead, setSlowRead] = useState(false);

  const choose = (chosen: readonly File[]): void => {
    const result = readCatalogFiles(chosen);
    if (result.kind === 'problem') {
      setFiles(null);
      setOutcome({ kind: 'problem', message: result.message, showExample: false });
    } else {
      setFiles(result);
      setOutcome(null);
    }
  };

  useEffect(() => {
    const allowDrop = (e: DragEvent): void => e.preventDefault();
    const onDrop = (e: DragEvent): void => {
      e.preventDefault();
      const dropped = Array.from(e.dataTransfer?.files ?? []);
      if (dropped.length === 0) return;
      choose(dropped);
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
    };
    window.addEventListener('dragover', allowDrop);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', allowDrop);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // Once files are chosen, Enter is one key away from loading them.
  useEffect(() => {
    if (files) confirmRef.current?.focus();
  }, [files]);

  const open = (): void => {
    dialogRef.current?.showModal();
    chooseRef.current?.focus();
  };

  const edited =
    <T,>(set: (value: T) => void) =>
    (value: T): void => {
      set(value);
      setOutcome(null);
    };

  const settings: CatalogImportSettings = {
    format:
      formatKind === 'cartesianMpc'
        ? { kind: 'cartesianMpc' }
        : { kind: 'raDecRedshift', h0KmSMpc: Number(h0), omegaM: Number(omegaM) },
    weight:
      weightKind === 'linear'
        ? { kind: 'linear', scale: Number(scale) }
        : { kind: 'log10MassMsun' },
  };

  const load = (catalog: UserCatalog): void => {
    dispatch(userCatalogLoaded(catalog));
    setOutcome(null);
    dialogRef.current?.close();
  };

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (!files || reading) return;
    if (outcome?.kind === 'warning') return load(outcome.catalog);
    setReading(true);
    const slow = setTimeout(() => setSlowRead(true), SLOW_READ_MS);
    parseCatalogFiles(files, settings)
      .then((result) => {
        if (!dialogRef.current?.open) return; // cancelled while reading
        if (result.kind === 'ready') load(result.catalog);
        else setOutcome(result);
      })
      .catch((err: unknown) =>
        setOutcome({ kind: 'problem', message: (err as Error).message, showExample: false }),
      )
      .finally(() => {
        clearTimeout(slow);
        setReading(false);
        setSlowRead(false);
      });
  };

  const filesName = files ? catalogFilesName(files) : null;
  const status =
    slowRead && filesName
      ? `Reading ${filesName}…`
      : outcome?.kind === 'warning'
        ? outcome.message
        : '';

  return (
    <>
      <PanelRow>
        <Button ref={openerRef} className={styles.openButton} onClick={open}>
          Load catalog
        </Button>
      </PanelRow>
      <dialog
        ref={dialogRef}
        className={styles.root}
        aria-labelledby={titleId}
        onClose={() => openerRef.current?.focus()}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close(); // the backdrop
        }}
      >
        <form
          className={styles.form}
          onSubmit={onSubmit}
          onKeyDown={(e) => {
            const target = e.target as HTMLInputElement;
            if (e.key === 'Enter' && target.type === 'radio') {
              e.preventDefault();
              e.currentTarget.requestSubmit();
            }
          }}
        >
          <header>
            <h2 id={titleId} className={styles.title}>
              Load catalog
            </h2>
            <p className={styles.hint}>Read in this browser. The file is not uploaded.</p>
          </header>

          <div className={styles.fileRow}>
            <Button
              ref={chooseRef}
              className={styles.button}
              onClick={() => fileInputRef.current?.click()}
            >
              Choose file
            </Button>
            {filesName && (
              <span className={styles.fileName} title={filesName}>
                {filesName}
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.bin,.txt"
              multiple
              hidden
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []);
                e.target.value = ''; // so choosing the same file again still fires
                if (chosen.length > 0) choose(chosen);
              }}
            />
          </div>

          {/* Under the file and above the column choice: the two things a problem points at. */}
          {outcome?.kind === 'problem' && (
            <div className={styles.problem}>
              <p role="alert" className={styles.message}>
                {outcome.message}
              </p>
              {outcome.showExample && (
                <div className={styles.example}>
                  <span className={styles.label}>Example</span>
                  <pre className={styles.exampleRows}>
                    {CATALOG_EXAMPLES[formatKind].join('\n')}
                  </pre>
                </div>
              )}
            </div>
          )}

          {files?.kind !== 'packed' && (
            <>
              <ChoiceGroup
                legend="Columns"
                options={FORMAT_CHOICES}
                value={formatKind}
                onChange={edited(setFormatKind)}
                hint={FORMAT_CHOICES.find((c) => c.value === formatKind)!.hint}
              >
                {formatKind === 'raDecRedshift' && (
                  <div className={styles.fields}>
                    <label className={styles.field}>
                      <span className={styles.label}>H0 (km/s/Mpc)</span>
                      <input
                        className={styles.input}
                        type="number"
                        step="any"
                        min="1"
                        required
                        value={h0}
                        onChange={(e) => edited(setH0)(e.target.value)}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Ωm</span>
                      <input
                        className={styles.input}
                        type="number"
                        step="any"
                        min="0"
                        max="1"
                        required
                        value={omegaM}
                        onChange={(e) => edited(setOmegaM)(e.target.value)}
                      />
                    </label>
                    <p className={styles.hint}>Flat ΛCDM.</p>
                  </div>
                )}
              </ChoiceGroup>

              <ChoiceGroup
                legend="Weight is"
                options={WEIGHT_CHOICES}
                value={weightKind}
                onChange={edited(setWeightKind)}
                hint={WEIGHT_CHOICES.find((c) => c.value === weightKind)!.hint}
              >
                {weightKind === 'linear' && (
                  <div className={styles.fields}>
                    <label className={styles.field}>
                      <span className={styles.label}>Weight scale</span>
                      <input
                        className={styles.input}
                        type="number"
                        step="any"
                        required
                        value={scale}
                        onChange={(e) => edited(setScale)(e.target.value)}
                      />
                      <span className={styles.hint}>
                        Multiplies the weight column. 0.001 turns 10⁹{'\u00a0'}M☉ into 10¹²
                        {'\u00a0'}M☉.
                      </span>
                    </label>
                  </div>
                )}
              </ChoiceGroup>
            </>
          )}

          <footer className={styles.footer}>
            <p role="status" className={slowRead ? styles.reading : styles.warning}>
              {status}
            </p>
            <div className={styles.actions}>
              <Button className={styles.button} onClick={() => dialogRef.current?.close()}>
                Cancel
              </Button>
              <Button
                ref={confirmRef}
                type="submit"
                variant="primary"
                className={styles.button}
                disabled={!files || reading}
                aria-busy={reading}
              >
                {outcome?.kind === 'warning' ? 'Load anyway' : 'Load catalog'}
              </Button>
            </div>
          </footer>
        </form>
      </dialog>
    </>
  );
}

export default LoadCatalogDialog;
