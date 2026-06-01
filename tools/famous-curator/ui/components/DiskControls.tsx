/**
 * DiskControls — "Deproject to face-on" toggle and disk b/a readout.
 *
 * Renders nothing when no disk has been drawn — there is no geometry to
 * configure, so showing the fieldset would be misleading.
 *
 * Edge-on advisory: DEPROJECT_MIN_AXIS_RATIO is advisory, not a lockout.
 * The checkbox is always interactive — a curator may force deprojection
 * even on a very edge-on disk.  When the effective b/a falls below the
 * advisory threshold a non-blocking warning notes that the minor-axis
 * stretch will be aggressive.  The stored deproject value is NOT coerced
 * from render — auto-flipping state on render would cause a render loop
 * (each flip re-renders, re-triggering the flip).
 *
 * Effective axis ratio resolution: disk.axisRatio > catalogAxisRatio > 1
 * (same chain as DiskOverlay and the export route), so the warning reads
 * from the same value the pipeline will use.
 */
import type { RecipeDisk } from '../../plugin/recipe';
import {
  DEPROJECT_MIN_AXIS_RATIO,
  DEFAULT_DISK_MARGIN,
} from '../../../../src/data/famousCalibration';

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
  const veryEdgeOn = effectiveAxisRatio < DEPROJECT_MIN_AXIS_RATIO;

  return (
    <fieldset className="curator-disk-controls">
      <legend>Disk</legend>
      <label htmlFor="disk-deproject">
        <input
          id="disk-deproject"
          type="checkbox"
          checked={disk.deproject}
          onChange={(e) => onDiskChange({ ...disk, deproject: e.target.checked })}
        />
        Deproject to face-on
      </label>
      {/* Sky-padding slider — only meaningful for the deproject crop, so it is
          hidden until deproject is on.  Falls back to the shared default when
          the disk has no stored margin yet. */}
      {disk.deproject === true && (
        <label htmlFor="disk-margin" className="curator-disk-controls__margin">
          Margin
          <input
            id="disk-margin"
            data-testid="margin-slider"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={disk.margin ?? DEFAULT_DISK_MARGIN}
            onChange={(e) => onDiskChange({ ...disk, margin: Number(e.target.value) })}
          />
        </label>
      )}
      {veryEdgeOn && (
        <p className="curator-disk-controls__note" data-testid="deproject-warning">
          Very edge-on (b/a {effectiveAxisRatio.toFixed(2)}) — deprojection will stretch the minor
          axis heavily.
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
