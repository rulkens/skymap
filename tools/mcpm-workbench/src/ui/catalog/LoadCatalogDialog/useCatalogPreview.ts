import { useEffect, useEffectEvent, useState } from 'react';
import type { CatalogFiles } from '../../../../@types/catalog/import/CatalogFiles';
import type { CatalogParse } from '../../../../@types/catalog/import/CatalogParse';
import type { CatalogPreviewInput } from '../../../../@types/catalog/import/CatalogPreviewInput';
import { createCatalogWorkerClient } from '../../../catalog/worker/createCatalogWorkerClient';
import { createCatalogWorkerTransport } from '../../../catalog/worker/createCatalogWorkerTransport';
import { REPARSE_DELAY_MS } from './data/reparseDelayMs.constant';
import { SLOW_READ_MS } from './data/slowReadMs.constant';

/**
 * useCatalogPreview — the chosen file in the catalog worker: read once while the
 * dialog is open, derived at once, then again when a setting changes, so what it
 * holds shows before Load and the page never waits on it. `forget` drops it from
 * the worker; the worker forgets the last file before it reads the next, so two
 * are never held.
 */
export function useCatalogPreview({
  open,
  files,
  settings,
  autoFitPercent,
  onRefused,
}: CatalogPreviewInput) {
  const [worker] = useState(() => createCatalogWorkerClient(createCatalogWorkerTransport));
  // The files the worker holds, only while open and needed: 400 MB of CSV is ~280 MB of columns.
  const [held, setHeld] = useState<CatalogFiles | null>(null);
  const [parsed, setParsed] = useState<CatalogParse | null>(null);
  const [slowRead, setSlowRead] = useState(false);
  const refused = useEffectEvent(onRefused);

  // Null while a field is wrong: nothing is parsed until the settings are whole.
  // The Auto fit percent is in the key because the worker fits the box too.
  const settingsKey =
    settings === null
      ? null
      : files?.kind === 'packed'
        ? `packed@${autoFitPercent}`
        : `${JSON.stringify(settings)}@${autoFitPercent}`;
  const shownParse = files !== null && parsed?.files === files ? parsed : null;
  const current = shownParse !== null && shownParse.settingsKey === settingsKey;

  useEffect(() => () => worker.dispose(), [worker]);

  const needsRead = open && files !== null && held !== files;
  useEffect(() => {
    if (!needsRead || !files) return;
    let live = true;
    const slow = setTimeout(() => setSlowRead(true), SLOW_READ_MS);
    void worker.read(files).then((read) => {
      if (!live || read === null) return;
      if (read.kind === 'held') return setHeld(files);
      refused(read.message);
    });
    return () => {
      live = false;
      clearTimeout(slow);
      setSlowRead(false);
    };
  }, [needsRead, files, worker]);

  const parseNow = useEffectEvent((): void => {
    if (!files || settings === null || settingsKey === null) return;
    const key = settingsKey;
    void worker.derive(settings, autoFitPercent).then((next) => {
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

  const forget = (): void => {
    worker.drop();
    setHeld(null);
    setParsed(null);
  };

  return {
    parsed,
    preview: shownParse?.preview ?? null,
    current,
    stale: shownParse !== null && !current,
    busy: files !== null && settingsKey !== null && !current,
    slowRead,
    forget,
  };
}
