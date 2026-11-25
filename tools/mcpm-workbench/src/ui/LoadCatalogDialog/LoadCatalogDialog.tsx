/**
 * LoadCatalogDialog — the modal the Data section's "Load catalog…" row opens
 * (the owner's ruled exception to ui-ux.md's no-modal rule). Mounted on the
 * sidebar root, never in a foldable body, because it also owns the window drop
 * listener: a file dropped anywhere opens it with that file chosen. Files are read
 * and parsed in the page; the store sees only a parsed catalog, so a refused
 * or warned load leaves the loaded one in place. Closing keeps every choice,
 * which is why a click on the backdrop may close it.
 */
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { CatalogFiles } from '../../../@types/CatalogFiles';
import type { CatalogImportFieldProblems } from '../../../@types/CatalogImportFieldProblems';
import type { CatalogImportFields } from '../../../@types/CatalogImportFields';
import type { CatalogLoadOutcome } from '../../../@types/CatalogLoadOutcome';
import type { UserCatalog } from '../../../@types/UserCatalog';
import Button from '../../../../../src/components/common/Button/Button';
import { userCatalogLoaded } from '../../state/catalog/catalogSlice';
import { useAppDispatch } from '../../store/hooks';
import FormField from '../FormField/FormField';
import ImportIcon from '../icons/ImportIcon/ImportIcon';
import SegmentedControl from '../SegmentedControl/SegmentedControl';
import { CATALOG_EXAMPLES } from './utils/CATALOG_EXAMPLES';
import { catalogFilesName } from './utils/catalogFilesName';
import { FORMAT_CHOICES } from './utils/FORMAT_CHOICES';
import { importFieldProblems } from './utils/importFieldProblems';
import { importSettingsFrom } from './utils/importSettingsFrom';
import { NAME_END_CHARS } from './utils/NAME_END_CHARS';
import { parseCatalogFiles } from './utils/parseCatalogFiles';
import { readCatalogFiles } from './utils/readCatalogFiles';
import { SLOW_READ_MS } from './utils/SLOW_READ_MS';
import { WEIGHT_CHOICES } from './utils/WEIGHT_CHOICES';
import styles from './LoadCatalogDialog.module.css';

const ICON_SIZE = 12;

export type LoadCatalogDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

function LoadCatalogDialog({ open, onOpenChange }: LoadCatalogDialogProps): ReactNode {
  const dispatch = useAppDispatch();
  const titleId = useId();
  const noteId = useId();
  const fileStatusId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Bumped by every new read, choice and close: a read whose id is stale is dropped.
  const readId = useRef(0);

  const [files, setFiles] = useState<CatalogFiles | null>(null);
  const [fields, setFields] = useState<CatalogImportFields>({
    formatKind: 'cartesianMpc',
    weightKind: 'linear',
    h0: '70',
    omegaM: '0.315',
    scale: '1',
  });
  // A field's error shows once it has been left or a load was tried, never while typing.
  const [checked, setChecked] = useState<readonly (keyof CatalogImportFieldProblems)[]>([]);
  const [outcome, setOutcome] = useState<Exclude<CatalogLoadOutcome, { kind: 'ready' }> | null>(
    null,
  );
  const [reading, setReading] = useState(false);
  const [slowRead, setSlowRead] = useState(false);

  // A packed pair carries its own settings, so its fields are never in the way.
  const problems = files?.kind === 'packed' ? {} : importFieldProblems(fields);
  const shown = (field: keyof CatalogImportFieldProblems): string | undefined =>
    checked.includes(field) ? problems[field] : undefined;
  const check = (field: keyof CatalogImportFieldProblems) => (): void =>
    setChecked((c) => (c.includes(field) ? c : [...c, field]));

  const cancelRead = (): void => {
    readId.current += 1;
    setReading(false);
    setSlowRead(false);
  };

  const choose = (chosen: readonly File[]): void => {
    cancelRead();
    const result = readCatalogFiles(chosen);
    if (result.kind === 'problem') {
      setFiles(null);
      setOutcome({ kind: 'problem', message: result.message, showExample: false });
    } else {
      setFiles(result);
      setOutcome(null);
    }
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

  // Before the files effect, so a dropped file's Load button takes focus from
  // the first control that showModal() focuses.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (files) confirmRef.current?.focus();
  }, [files]);

  const edit = (patch: Partial<CatalogImportFields>): void => {
    setFields((f) => ({ ...f, ...patch }));
    setOutcome(null);
  };

  const load = (catalog: UserCatalog): void => {
    dispatch(userCatalogLoaded(catalog));
    setOutcome(null);
    dialogRef.current?.close();
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (reading) return;
    if (!files) return choose([]); // shows the "Choose a text table…" problem
    const wrong = Object.keys(problems) as (keyof CatalogImportFieldProblems)[];
    if (wrong.length > 0) {
      setChecked((c) => [...new Set([...c, ...wrong])]);
      (e.currentTarget.elements.namedItem(wrong[0]!) as HTMLInputElement | null)?.focus();
      return;
    }
    if (outcome?.kind === 'warning') return load(outcome.catalog);
    readId.current += 1;
    const id = readId.current;
    const current = (): boolean => id === readId.current;
    setReading(true);
    const slow = setTimeout(() => current() && setSlowRead(true), SLOW_READ_MS);
    parseCatalogFiles(files, importSettingsFrom(fields))
      .then((result) => {
        if (!current()) return;
        if (result.kind === 'ready') load(result.catalog);
        else setOutcome(result);
      })
      .catch((err: unknown) => {
        if (current())
          setOutcome({ kind: 'problem', message: (err as Error).message, showExample: false });
      })
      .finally(() => {
        clearTimeout(slow);
        if (!current()) return;
        setReading(false);
        setSlowRead(false);
      });
  };

  const filesName = files ? catalogFilesName(files) : null;
  const packed = files?.kind === 'packed';
  const warned = outcome?.kind === 'warning';

  return (
    <dialog
      ref={dialogRef}
      className={styles.root}
      aria-labelledby={titleId}
      aria-describedby={noteId}
      closedby="any"
      onClose={() => {
        cancelRead();
        onOpenChange(false);
      }}
    >
      <form
        className={styles.form}
        noValidate
        onSubmit={onSubmit}
        onKeyDown={(e) => {
          // A radio has no implicit submission; Enter still loads.
          if (e.key === 'Enter' && (e.target as HTMLInputElement).type === 'radio') {
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
                      // What readCatalogFiles accepts.
                      <span className={styles.formats}>Text table, or .bin + .txt</span>
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

            {outcome?.kind === 'problem' && (
              <div className={styles.issue}>
                <p role="alert" className={styles.problem}>
                  {outcome.message}
                </p>
                {outcome.showExample && (
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
                  value={fields.scale}
                  onChange={(e) => edit({ scale: e.target.value })}
                  onBlur={check('scale')}
                />
              )}
            </FormField>
          </div>

          {warned && (
            <p role="status" className={styles.warning}>
              {outcome.message}
            </p>
          )}
        </div>

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
            aria-busy={reading}
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
