/**
 * DiskControls — "Deproject to face-on" toggle and disk b/a readout.
 *
 * Renders nothing when no disk has been drawn — there is no geometry to
 * configure, so showing the fieldset would be misleading.
 *
 * Edge-on lockout: when the effective b/a falls below
 * DEPROJECT_MIN_AXIS_RATIO the checkbox is disabled and a note explains
 * why.  The stored deproject value is NOT coerced to false here — the
 * export/process pipeline guards already handle the as-shot fallthrough,
 * and auto-flipping state on render would cause a render loop (each flip
 * triggers a re-render which triggers the effect again).  The disabled
 * control plus the pipeline guard is the correct boundary of
 * responsibility: the UI says "you can't", the pipeline enforces it.
 *
 * Effective axis ratio resolution: disk.axisRatio > catalogAxisRatio > 1
 * (same chain as DiskOverlay and the export route), so the lockout reads
 * from the same value the pipeline will use.
 */
import type { RecipeDisk } from '../../plugin/recipe';
import { DEPROJECT_MIN_AXIS_RATIO } from '../../../../src/data/famousCalibration';

export type DiskControlsProps = {
  disk: RecipeDisk | undefined;
  /** Catalog-derived b/a from the seed's HyperLEDA enrichment. */
  catalogAxisRatio: number | undefined;
  onDiskChange: (d: RecipeDisk) => void;
};

export function DiskControls(props: DiskControlsProps) {
  const { disk, catalogAxisRatio, onDiskChange } = props;

  // No disk drawn → nothing to configure.
  if (disk === undefined) return null;

  // Resolved b/a: user override > catalog > assume round (1).
  const effectiveAxisRatio = disk.axisRatio ?? catalogAxisRatio ?? 1;
  const tooEdgeOn = effectiveAxisRatio < DEPROJECT_MIN_AXIS_RATIO;

  return (
    <fieldset className="curator-disk-controls">
      <legend>Disk</legend>
      <label htmlFor="disk-deproject">
        <input
          id="disk-deproject"
          type="checkbox"
          checked={disk.deproject}
          disabled={tooEdgeOn}
          onChange={(e) => onDiskChange({ ...disk, deproject: e.target.checked })}
        />
        Deproject to face-on
      </label>
      {tooEdgeOn && (
        <p className="curator-disk-controls__note">
          as-shot only (too edge-on: b/a {effectiveAxisRatio.toFixed(2)} &lt;{' '}
          {DEPROJECT_MIN_AXIS_RATIO})
        </p>
      )}
      {/* Resolved b/a readout — shows the maintainer exactly which value the
          pipeline will use when deprojecting, including the catalog fallback. */}
      <span className="curator-disk-controls__ratio">
        b/a {effectiveAxisRatio.toFixed(2)}
        {disk.axisRatio === undefined && catalogAxisRatio !== undefined ? ' (catalog)' : ''}
      </span>
    </fieldset>
  );
}
