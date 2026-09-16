// src/components/DebugPanel/EarthTileAtlasSection.tsx
/**
 * EarthTileAtlasSection — textual residency readout for Earth's surface
 * virtual texture: slot pressure, per-level resident/pending counts, the
 * last plan's shape, and the deepest level's resident tile keys.
 *
 * No visualization — this is for reading numbers against
 * `surfaceTileSubsystem.ts`'s `resident` map and page-table window while
 * chasing a tile-residency bug, not for a first look at the feature.
 *
 * ### Why poll, not subscribe
 *
 * `getDebugSnapshot()` is a fresh on-demand read (an O(resident) Map scan),
 * not a pushed event — there's no per-tile-arrival channel to subscribe to,
 * and adding one just for this readout would be a render-path hook for a
 * debug-only consumer. Polling at `FrameStatsRow`'s 4 Hz is plenty for a
 * number a human reads a few times a second.
 */

import { Fragment, useEffect, useState, type FormEvent, type ReactElement } from 'react';
import type { SurfaceTileDebugSnapshot } from '../../@types/scene/SurfaceTileDebugSnapshot';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';
import type { BodyId } from '../../@types/data/body/BodyId';
import { DEBUG_OVERLAY_ROWS } from '../../data/debug/debugOverlayRows';
import { parseLonLatInput } from '../../utils/scene/parseLonLatInput';
import DebugSection from './DebugSection';
import styles from './EarthTileAtlasSection.module.css';

export type EarthTileAtlasSectionProps = {
  earthTileDebug: () => SurfaceTileDebugSnapshot;
  /** Fly-to-coordinates debug instrument, from the engine handle's
   *  `debug.flyToLonLat`. `body` omitted keeps `flyToLonLatActions`'s own
   *  Earth default — this section passes the snapshot's `bodyId` verbatim. */
  flyToLonLat: (lonDeg: number, latDeg: number, body?: BodyId) => void;
  readonly overlays: Record<DebugOverlayKey, boolean>;
  readonly onToggle: (key: DebugOverlayKey, enabled: boolean) => void;
};

/** The `section: 'earth-tiles'` rows — terrain bisect toggles, which belong
 *  beside the residency numbers that explain what they change. */
const TERRAIN_ROWS = DEBUG_OVERLAY_ROWS.filter(
  (row) => 'section' in row && row.section === 'earth-tiles',
);

const POLL_MS = 250;

function EarthTileAtlasSection({
  earthTileDebug,
  flyToLonLat,
  overlays,
  onToggle,
}: EarthTileAtlasSectionProps): ReactElement {
  const [snap, setSnap] = useState<SurfaceTileDebugSnapshot>(earthTileDebug);
  // Uncontrolled-feeling text box: the panel never reformats what the user
  // typed, so an in-progress edit ("12.53, 5") isn't clobbered by the 4 Hz
  // poll — this state is local and update-on-submit only.
  const [flyToText, setFlyToText] = useState('');

  useEffect(() => {
    const id = setInterval(() => setSnap(earthTileDebug()), POLL_MS);
    return () => clearInterval(id);
  }, [earthTileDebug]);

  // Lives outside the `!snap.engaged` early return below: flying IN is
  // exactly what a not-yet-engaged reader needs — gating the box on
  // engagement would hide the one control that gets them there.
  function handleFlyToSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const point = parseLonLatInput(flyToText);
    if (point === null) return;
    flyToLonLat(point.lonDeg, point.latDeg, snap.bodyId ?? undefined);
  }

  const terrainToggles = (
    <div className={styles.toggles}>
      {TERRAIN_ROWS.map((row) => (
        <label key={row.key} className={styles.checkRow}>
          <input
            type="checkbox"
            checked={overlays[row.key]}
            onChange={(e) => onToggle(row.key, e.target.checked)}
          />
          <span>{row.label}</span>
        </label>
      ))}
    </div>
  );

  const flyToForm = (
    <form className={styles.flyToRow} onSubmit={handleFlyToSubmit}>
      <input
        className={styles.input}
        type="text"
        placeholder="lon, lat (e.g. 12.53, 55.67)"
        value={flyToText}
        onChange={(e) => setFlyToText(e.target.value)}
      />
      <button type="submit" className={styles.button}>
        Fly to
      </button>
    </form>
  );

  if (!snap.engaged) {
    return (
      <DebugSection title="Surface Tiles">
        {flyToForm}
        {terrainToggles}
        <div className={styles.notice}>Not engaged — no manifest, or camera outside Earth.</div>
      </DebugSection>
    );
  }

  const totalResident = snap.levels.reduce((sum, row) => sum + row.resident, 0);
  const totalPending = snap.levels.reduce((sum, row) => sum + row.pending, 0);
  const deepestZ = snap.levels.at(-1)?.z;

  return (
    <DebugSection title={`Surface Tiles — ${snap.bodyId} (${snap.used}/${snap.capacity} slots)`}>
      {flyToForm}
      {terrainToggles}
      <div className={styles.levels}>
        <span className={styles.head}>z</span>
        <span className={styles.head}>resident</span>
        <span className={styles.head}>pending</span>
        {snap.levels.map((row) => (
          <Fragment key={row.z}>
            <span className={styles.number}>{row.z}</span>
            <span className={styles.number}>{row.resident}</span>
            <span className={styles.number}>{row.pending}</span>
          </Fragment>
        ))}
        <span className={styles.total}>total</span>
        <span className={styles.total}>{totalResident}</span>
        <span className={styles.total}>{totalPending}</span>
      </div>

      <div
        className={styles.readout}
        title="Height atlas slots — residency here is what lets the walk refine"
      >
        height {snap.height.used}/{snap.height.capacity}
      </div>

      <div className={styles.readout}>
        {snap.plan
          ? `plan: ${snap.plan.requestCount} req · zWin ${snap.plan.zWin} · ${snap.plan.misses} miss`
          : 'plan: —'}
        {snap.droppedAllocations > 0 && ` · ${snap.droppedAllocations} alloc dropped`}
      </div>

      {snap.plan && (
        <div
          className={styles.readout}
          title="Leaves in the last frame's drawn cut — unbounded, a growth watch"
        >
          cut: {snap.plan.cutCount} tiles drawn
        </div>
      )}

      {deepestZ !== undefined && (
        <div className={styles.readout} title="Resident x,y at the deepest active level">
          z{deepestZ} resident: {snap.deepestLevelKeys.join(', ') || '—'}
        </div>
      )}

      {snap.subCamera && (
        <div
          className={styles.readout}
          title="Where the last plan's camera sat, and the deepest band baked there"
        >
          sub-camera: {formatLonLat(snap.subCamera.lonDeg, snap.subCamera.latDeg)} · deepest band
          here: {snap.subCamera.coveredMaxLevel ?? 'none'}
        </div>
      )}
    </DebugSection>
  );
}

/** East/west, north/south degree pair at 5 decimals — ~1 m resolution, the
 *  scale this readout exists to catch (a demo band a few hundred metres wide). */
function formatLonLat(lonDeg: number, latDeg: number): string {
  const ew = lonDeg >= 0 ? 'E' : 'W';
  const ns = latDeg >= 0 ? 'N' : 'S';
  return `${Math.abs(lonDeg).toFixed(5)}°${ew}, ${Math.abs(latDeg).toFixed(5)}°${ns}`;
}

export default EarthTileAtlasSection;
