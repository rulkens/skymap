/**
 * PresetsSection — Download / Upload / Copy for the current galaxy +
 * rendering settings, as portable JSON. The spike's
 * `localStorage` round-trip (save-to-browser button, saved-preset chips)
 * isn't ported: it doesn't survive a page reload of THIS tool being run
 * from a different origin/path across sessions, and download/upload already
 * covers "keep this for later" more durably than an in-browser list would.
 *
 * `serializeGalaxyPreset`/`parseGalaxyPreset` own the wire format (the
 * flat-vs-split render/LOD fold); this component only drives the three
 * browser-native transports (Blob download, file input, Clipboard API) and
 * reports success/failure via `ui.copyFeedback`, self-clearing after
 * 1600ms — the same feedback window the spike used.
 *
 * Unlike every other group in `ControlsPanel`, this one has no chevron:
 * the spike's "SAVED SETTINGS" heading was never wired to
 * `toggleSection`, so the static label here is a plain div, not a
 * `CollapsibleSection`.
 */
import { useRef, type ChangeEvent, type ReactNode } from 'react';
import Button from '../../../../../src/components/common/Button/Button';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { paramsPatched } from '../../state/slices/galaxySlice';
import { renderPatched } from '../../state/slices/renderSlice';
import { lodPatched } from '../../state/slices/lodSlice';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { extrasToggled, extrasCountSet } from '../../state/slices/extrasSlice';
import { copyFeedbackSet } from '../../state/slices/uiSlice';
import { serializeGalaxyPreset } from '../../presets/serializeGalaxyPreset';
import { parseGalaxyPreset } from '../../presets/parseGalaxyPreset';
import styles from './PresetsSection.module.css';

const FEEDBACK_CLEAR_MS = 1600;

function PresetsSection(): ReactNode {
  const dispatch = useAppDispatch();
  const galaxy = useAppSelector((state) => state.galaxy);
  const render = useAppSelector((state) => state.render);
  const lod = useAppSelector((state) => state.lod);
  const fieldTuning = useAppSelector((state) => state.fieldTuning);
  const extras = useAppSelector((state) => state.extras);
  const copyFeedback = useAppSelector((state) => state.ui.copyFeedback);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearFeedbackSoon = (): void => {
    setTimeout(() => dispatch(copyFeedbackSet('')), FEEDBACK_CLEAR_MS);
  };

  const handleDownload = (): void => {
    const json = serializeGalaxyPreset(galaxy, render, lod, fieldTuning, extras);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `galaxy-${galaxy.type}-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same filename later
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseGalaxyPreset(String(reader.result));
      if (parsed) {
        dispatch(paramsPatched(parsed.p));
        dispatch(renderPatched(parsed.r));
        dispatch(lodPatched(parsed.lod));
        dispatch(fieldTuningPatched(parsed.f));
        // extrasSlice has no wholesale patch action (see its header) — set
        // only the fields a v2 file actually carried; a v1 file (parsed.x
        // always {}) leaves extras untouched rather than resetting it.
        if (parsed.x.enabled !== undefined) dispatch(extrasToggled(parsed.x.enabled));
        if (parsed.x.count !== undefined) dispatch(extrasCountSet(parsed.x.count));
        dispatch(copyFeedbackSet('loaded ✓'));
      } else {
        dispatch(copyFeedbackSet('invalid file'));
      }
      clearFeedbackSoon();
    };
    reader.readAsText(file);
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(
        serializeGalaxyPreset(galaxy, render, lod, fieldTuning, extras),
      );
      dispatch(copyFeedbackSet('copied ✓'));
    } catch {
      dispatch(copyFeedbackSet('failed'));
    }
    clearFeedbackSoon();
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>PRESETS</div>
      <div className={styles.row}>
        <Button className={styles.button} onClick={handleDownload}>
          ⭳ Download
        </Button>
        <Button className={styles.button} onClick={() => fileInputRef.current?.click()}>
          ⭱ Upload
        </Button>
        <Button className={styles.button} onClick={() => void handleCopy()}>
          {copyFeedback || '⧉ Copy'}
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className={styles.hiddenInput}
        onChange={handleFileChange}
      />
      <div className={styles.hint}>
        Download or copy the current galaxy and rendering settings as JSON, or upload a file to
        restore them.
      </div>
    </div>
  );
}

export default PresetsSection;
