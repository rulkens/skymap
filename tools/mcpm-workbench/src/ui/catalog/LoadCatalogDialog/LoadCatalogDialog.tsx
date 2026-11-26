/**
 * LoadCatalogDialog — the modal the Data section's "Load catalog…" row opens
 * (the owner's ruled exception to ui-ux.md's no-modal rule). Mounted on the
 * sidebar root, never in a foldable body, because it also owns the window drop
 * listener: a file dropped anywhere opens it with that file chosen. A chosen
 * file is read once into the catalog worker and derived there at once, then
 * again when a setting changes, so what it holds shows before Load and the page
 * never waits on it; Load hands that result on. The store sees only a parsed
 * catalog, so a refused or warned file leaves the loaded one in place. Closing
 * keeps every choice but drops the file from memory, so the backdrop may close
 * it; only Auto fit is on again at every open.
 */
import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from 'react';
import type { CatalogFiles } from '../../../../@types/catalog/import/CatalogFiles';
import type { CatalogImportFieldProblems } from '../../../../@types/catalog/import/CatalogImportFieldProblems';
import type { CatalogImportFields } from '../../../../@types/catalog/import/CatalogImportFields';
import type { CatalogParse } from '../../../../@types/catalog/import/CatalogParse';
import type { UserCatalogLoad } from '../../../../@types/catalog/UserCatalogLoad';
import Button from '../../../../../../src/components/common/Button/Button';
import { createCatalogWorkerClient } from '../../../catalog/worker/createCatalogWorkerClient';
import { createCatalogWorkerTransport } from '../../../catalog/worker/createCatalogWorkerTransport';
import FormField from '../../panel/FormField/FormField';
import ImportIcon from '../../icons/ImportIcon/ImportIcon';
import SegmentedControl from '../../panel/SegmentedControl/SegmentedControl';
import AutoFitField from './AutoFitField/AutoFitField';
import LoadInfo from './LoadInfo/LoadInfo';
import { CATALOG_EXAMPLES } from './data/catalogExamples.constant';
import { catalogFilesName } from './utils/catalogFilesName';
import { FORMAT_CHOICES } from './data/formatChoices.constant';
import { importFieldProblems } from './utils/importFieldProblems';
import { importSettingsFrom } from './utils/importSettingsFrom';
import { NAME_END_CHARS } from './data/nameEndChars.constant';
import { classifyCatalogFiles } from './utils/classifyCatalogFiles';
import { REPARSE_DELAY_MS } from './data/reparseDelayMs.constant';
import { SLOW_READ_MS } from './data/slowReadMs.constant';
import { WEIGHT_CHOICES } from './data/weightChoices.constant';
import styles from './LoadCatalogDialog.module.css';

const ICON_SIZE = 12;

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
  const fileStatusId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Only a file's first parse moves focus to Load; a re-parse leaves it where the user is.
  const focusedFor = useRef<CatalogFiles | null>(null);

  const [worker] = useState(() => createCatalogWorkerClient(createCatalogWorkerTransport));
  const [files, setFiles] = useState<CatalogFiles | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // The files the worker holds, only while open and needed: 400 MB of CSV is ~280 MB of columns.
  const [held, setHeld] = useState<CatalogFiles | null>(null);
  const [parsed, setParsed] = useState<CatalogParse | null>(null);
  const [fields, setFields] = useState<CatalogImportFields>({
    formatKind: 'cartesianMpc',
    weightKind: 'linear',
    h0: '70',
    omegaM: '0.315',
    scale: '1',
  });
  // A field's error shows once it has been left or Enter was pressed, never while typing.
  const [checked, setChecked] = useState<readonly (keyof CatalogImportFieldProblems)[]>([]);
  const [slowRead, setSlowRead] = useState(false);
  const [autoFit, setAutoFit] = useState(true);

  const packed = files?.kind === 'packed';
  // A packed pair carries its own settings, so its fields are never in the way.
  const problems = packed ? {} : importFieldProblems(fields);
  const wrong = Object.keys(problems) as (keyof CatalogImportFieldProblems)[];
  const shown = (field: keyof CatalogImportFieldProblems): string | undefined =>
    checked.includes(field) ? problems[field] : undefined;
  const check = (field: keyof CatalogImportFieldProblems) => (): void =>
    setChecked((c) => (c.includes(field) ? c : [...c, field]));

  // Null while a field is wrong: nothing is parsed until the settings are whole.
  // The Auto fit percent is in the key because the worker fits the box too.
  const settingsKey = packed
    ? `packed@${autoFitPercent}`
    : wrong.length > 0
      ? null
      : `${JSON.stringify(importSettingsFrom(fields))}@${autoFitPercent}`;
  const shownParse = files !== null && parsed?.files === files ? parsed : null;
  const current = shownParse !== null && shownParse.settingsKey === settingsKey;
  const preview = shownParse?.preview ?? null;
  const outcome = preview?.outcome ?? null;
  const catalog = outcome !== null && outcome.kind !== 'problem' ? outcome.catalog : null;
  const loadable = current && catalog !== null;
  const loadFit = autoFit ? (preview?.fitBounds ?? null) : null;

  useEffect(() => () => worker.dispose(), [worker]);

  const needsRead = open && files !== null && held !== files;
  useEffect(() => {
    if (!needsRead || !files) return;
    let live = true;
    const slow = setTimeout(() => setSlowRead(true), SLOW_READ_MS);
    void worker.read(files).then((read) => {
      if (!live || read === null) return;
      if (read.kind === 'held') return setHeld(files);
      setFiles(null);
      setRefusal(read.message);
    });
    return () => {
      live = false;
      clearTimeout(slow);
      setSlowRead(false);
    };
  }, [needsRead, files, worker]);

  const parseNow = useEffectEvent((): void => {
    if (!files || settingsKey === null) return;
    const key = settingsKey;
    void worker.derive(importSettingsFrom(fields), autoFitPercent).then((next) => {
      if (next) setParsed({ files, settingsKey: key, preview: next });
    });
  });

  // A new file parses at once; a changed setting waits out the typing.
  const firstParse = parsed?.files !== files;
  const ready = held !== null && held === files;
  useEffect(() => {
    if (!ready || settingsKey === null || current) return;
    const timer = setTimeout(() => parseNow(), firstParse ? 0 : REPARSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, settingsKey, current, firstParse]);

  useEffect(() => {
    if (!parsed || focusedFor.current === parsed.files) return;
    focusedFor.current = parsed.files;
    if (parsed.preview.outcome.kind !== 'problem') confirmRef.current?.focus();
  }, [parsed]);

  // The worker forgets the last file before it reads the next, so two are never held.
  const forget = (): void => {
    worker.drop();
    setHeld(null);
    setParsed(null);
  };

  const choose = (chosen: readonly File[]): void => {
    const result = classifyCatalogFiles(chosen);
    const refused = result.kind === 'problem';
    setFiles(refused ? null : result);
    setRefusal(refused ? result.message : null);
    forget();
  };

  const onDrop = useEffectEvent((e: DragEvent): void => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length === 0) return;
    choose(dropped);
    onOpenChange(true);
  });

  useEffect(() => {
    const allowDrop = (e: DragEvent): void => e.preventDefault();
    window.addEventListener('dragover', allowDrop);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', allowDrop);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const edit = (patch: Partial<CatalogImportFields>): void =>
    setFields((f) => ({ ...f, ...patch }));

  const filesName = files ? catalogFilesName(files) : null;
  const warned = outcome?.kind === 'warning';
  const stale = shownParse !== null && !current;
  const problem =
    refusal !== null
      ? { message: refusal, showExample: false }
      : outcome?.kind === 'problem'
        ? outcome
        : null;

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
          if (!loadable) return;
          onLoad({ catalog, fitBounds: loadFit });
          dialogRef.current?.close();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          // Load is off while a field is wrong; Enter says which.
          if (wrong.length > 0) {
            setChecked((c) => [...new Set([...c, ...wrong])]);
            (e.currentTarget.elements.namedItem(wrong[0]!) as HTMLInputElement | null)?.focus();
          }
          // A radio or a checkbox has no implicit submission; Enter still loads.
          const type = (e.target as HTMLInputElement).type;
          if (type === 'radio' || type === 'checkbox') {
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }
        }}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Load catalog
          </h2>
          <p id={noteId} className={styles.note}>
            Read in this browser. The file is not uploaded.
          </p>
        </header>

        <div className={styles.body}>
          <div className={styles.fields}>
            <FormField label="File">
              {(ids) => (
                <div id={ids.control} className={styles.file}>
                  <Button
                    className={styles.button}
                    aria-describedby={fileStatusId}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose file…
                  </Button>
                  {/* One line either way, the name cut in the middle so its end shows. */}
                  <span id={fileStatusId} className={styles.fileStatus}>
                    {filesName === null ? (
                      // What classifyCatalogFiles accepts.
                      <span className={styles.formats}>.csv, or .bin + _metadata.txt</span>
                    ) : (
                      <>
                        <span className={styles.nameStart}>
                          {filesName.slice(0, -NAME_END_CHARS)}
                        </span>
                        <span className={styles.nameEnd}>{filesName.slice(-NAME_END_CHARS)}</span>
                      </>
                    )}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt,.dat,.bin"
                    multiple
                    hidden
                    onChange={(e) => {
                      const chosen = Array.from(e.target.files ?? []);
                      e.target.value = ''; // so choosing the same file again still fires
                      if (chosen.length > 0) choose(chosen);
                    }}
                  />
                </div>
              )}
            </FormField>

            <AutoFitField on={autoFit} onChange={setAutoFit} />

            <FormField
              label="Columns"
              hint={FORMAT_CHOICES.find((c) => c.value === fields.formatKind)!.hint}
              hints={FORMAT_CHOICES.map((c) => c.hint)}
              inactive={packed}
            >
              {(ids) => (
                <SegmentedControl
                  options={FORMAT_CHOICES}
                  value={fields.formatKind}
                  onChange={(formatKind) => edit({ formatKind })}
                  labelledBy={ids.label}
                  describedBy={ids.hint}
                />
              )}
            </FormField>

            <FormField
              label="Comoving distance"
              hint="From redshift, flat ΛCDM."
              error={shown('h0') ?? shown('omegaM')}
              validated
              inactive={packed || fields.formatKind !== 'raDecRedshift'}
            >
              {(ids) => (
                <div
                  id={ids.control}
                  role="group"
                  aria-labelledby={ids.label}
                  className={styles.inline}
                >
                  <label className={styles.inlineField}>
                    H0 (km/s/Mpc)
                    <input
                      name="h0"
                      className={styles.number}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      aria-invalid={shown('h0') !== undefined}
                      aria-describedby={ids.hint}
                      value={fields.h0}
                      onChange={(e) => edit({ h0: e.target.value })}
                      onBlur={check('h0')}
                    />
                  </label>
                  <label className={styles.inlineField}>
                    Ωm
                    <input
                      name="omegaM"
                      className={styles.number}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      aria-invalid={shown('omegaM') !== undefined}
                      aria-describedby={ids.hint}
                      value={fields.omegaM}
                      onChange={(e) => edit({ omegaM: e.target.value })}
                      onBlur={check('omegaM')}
                    />
                  </label>
                </div>
              )}
            </FormField>

            <FormField
              label="Weight is"
              hint={WEIGHT_CHOICES.find((c) => c.value === fields.weightKind)!.hint}
              hints={WEIGHT_CHOICES.map((c) => c.hint)}
              inactive={packed}
            >
              {(ids) => (
                <SegmentedControl
                  options={WEIGHT_CHOICES}
                  value={fields.weightKind}
                  onChange={(weightKind) => edit({ weightKind })}
                  labelledBy={ids.label}
                  describedBy={ids.hint}
                />
              )}
            </FormField>

            <FormField
              label="Weight scale"
              hint={'0.001 turns 10⁹\u00a0M☉ into 10¹²\u00a0M☉.'}
              error={shown('scale')}
              warning={
                outcome?.kind === 'warning'
                  ? { message: outcome.warning.message, stale }
                  : undefined
              }
              validated
              inactive={packed || fields.weightKind !== 'linear'}
            >
              {(ids) => (
                <input
                  id={ids.control}
                  name="scale"
                  className={styles.number}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={shown('scale') !== undefined}
                  aria-describedby={ids.hint}
                  data-warned={outcome?.kind === 'warning' && outcome.warning.field === 'scale'}
                  value={fields.scale}
                  onChange={(e) => edit({ scale: e.target.value })}
                  onBlur={check('scale')}
                />
              )}
            </FormField>
          </div>

          {problem && (
            <div className={styles.issue}>
              <p role="alert" className={styles.problem}>
                {problem.message}
              </p>
              {problem.showExample && (
                <FormField label="Example">
                  {(ids) => (
                    <pre id={ids.control} className={styles.example}>
                      {CATALOG_EXAMPLES[fields.formatKind].join('\n')}
                    </pre>
                  )}
                </FormField>
              )}
            </div>
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

        <footer className={styles.footer}>
          <p role="status" className={styles.reading}>
            {slowRead && filesName ? `Reading ${filesName}…` : ''}
          </p>
          <Button className={styles.button} onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            type="submit"
            variant="primary"
            className={styles.load}
            disabled={!loadable}
            aria-busy={files !== null && settingsKey !== null && !current}
          >
            <ImportIcon size={ICON_SIZE} />
            {/* Both labels share one cell, so the button keeps its width. */}
            <span className={styles.loadLabels}>
              <span data-shown={!warned} aria-hidden={warned}>
                Load catalog
              </span>
              <span data-shown={warned} aria-hidden={!warned}>
                Load anyway
              </span>
            </span>
          </Button>
        </footer>
      </form>
    </dialog>
  );
}

export default LoadCatalogDialog;
