/**
 * FullCard — the rich panel for a selected/hovered galaxy or POI: thumbnail,
 * cosmology summary, coordinate rows, expandable details, external link.
 *
 * Galaxy and POI branches share the same outer `<div>` shape; that identity
 * is what preserves the native `<details>` open state across galaxy↔POI
 * swaps (see InfoCard.tsx header).
 */

import type { ReactNode } from 'react';
import { useState } from 'react';
import cx from 'classnames';
import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';
import { Source } from '../../data/sources';
import { formatDistance, formatDiameterKpc } from '../../utils/format/distance';
import { Thumbnail } from './Thumbnail';
import { InfoTip } from '../InfoTip/InfoTip';
import { TIPS } from './tooltips';
import styles from './FullCard.module.css';

export type FullCardMode =
  | { readonly kind: 'galaxy'; readonly info: GalaxyInfo }
  | { readonly kind: 'poi'; readonly poi: PointOfInterest };

/**
 * `mode` takes priority; `info` is the galaxy-mode shorthand for the common
 * call site.  Action callbacks are only rendered when `pinned` is true.
 */
export type FullCardProps = {
  mode?: FullCardMode;
  info?: GalaxyInfo;
  pinned?: boolean;
  onFocus?: (info: GalaxyInfo) => void;
  onPoiFocus?: (poi: PointOfInterest) => void;
  onClose?: () => void;
};

type CardRowProps = {
  label: ReactNode;
  value: ReactNode;
};

function CardRow({ label, value }: CardRowProps): ReactNode {
  return (
    <div className={styles.cardRow}>
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.cardValue}>{value}</span>
    </div>
  );
}

function poiCategoryLabel(category: PointOfInterest['category']): string {
  switch (category) {
    case 'cluster':
      return 'Galaxy Cluster';
    case 'supercluster':
      return 'Supercluster';
    case 'void':
      return 'Cosmic Void';
    case 'famousGalaxy':
      return 'Famous Galaxy';
  }
}

function renderPoiBody(
  poi: PointOfInterest,
  outerClass: string,
  pinned: boolean,
  onClose: (() => void) | undefined,
  onPoiFocus: ((poi: PointOfInterest) => void) | undefined,
): ReactNode {
  const distanceMpc = Math.hypot(poi.worldPos[0], poi.worldPos[1], poi.worldPos[2]);
  const categoryLabel = poiCategoryLabel(poi.category);

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>POI</span>
        <span className={styles.pinnedBadge}>Pinned</span>
        {pinned && onClose && (
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Clear selection"
            title="Clear selection (Esc)"
          >
            ×
          </button>
        )}
      </div>

      <div className={styles.cardHeadline}>{poi.name}</div>
      <div className={styles.sourceBadge}>{categoryLabel}</div>

      <div className={styles.cardSection}>
        <div className={styles.cardRow}>
          <span className={styles.cardLabel}>Distance</span>
          <span className={styles.cardValue}>{formatDistance(distanceMpc)}</span>
        </div>
        {poi.physicalRadiusMpc !== undefined && (
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Radius</span>
            <span className={styles.cardValue}>
              {formatDistance(poi.physicalRadiusMpc)}
            </span>
          </div>
        )}
      </div>

      {onPoiFocus && (
        <button
          type="button"
          className={styles.focusButton}
          onClick={() => onPoiFocus(poi)}
          aria-label={`Fly camera to ${poi.name}`}
        >
          Fly here
        </button>
      )}
    </div>
  );
}

export function FullCard(props: FullCardProps): ReactNode {
  const { pinned = false, onFocus, onPoiFocus, onClose } = props;

  const mode: FullCardMode | null =
    props.mode ?? (props.info ? { kind: 'galaxy' as const, info: props.info } : null);
  if (!mode) return null;

  const outerClass = pinned
    ? `${styles.infoCardFull} ${styles.pinned}`
    : `${styles.infoCardFull}`;

  // Called unconditionally so hook order matches across galaxy↔POI swaps.
  const [descExpanded, setDescExpanded] = useState(false);

  if (mode.kind === 'poi') {
    return renderPoiBody(mode.poi, `${outerClass} ${styles.poi}`, pinned, onClose, onPoiFocus);
  }

  const { info } = mode;
  const famousAliases =
    info.famous?.names.filter((n) => n !== info.displayName) ?? [];

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Object</span>
        <span className={styles.pinnedBadge}>Pinned</span>
        {pinned && onFocus && (
          <button
            type="button"
            className={styles.focusButton}
            onClick={() => onFocus(info)}
            aria-label={`Focus camera on ${info.displayName}`}
          >
            Focus
          </button>
        )}
        {pinned && onClose && (
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Clear selection"
            title="Clear selection (Esc)"
          >
            ×
          </button>
        )}
      </div>

      <div className={styles.cardHeadline}>{info.displayName}</div>
      <div className={styles.sourceBadge}>{info.sourceLabel}</div>

      {info.famous && (
        <div className={styles.cardSection}>
          {famousAliases.length > 0 && (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Also known as</span>
              <span className={styles.cardValue}>{famousAliases.join(' · ')}</span>
            </div>
          )}
          {info.famous.description && (
            <div className={styles.cardRow}>
              <span
                className={cx(
                  styles.cardValue,
                  descExpanded ? styles.descExpanded : styles.descCollapsed,
                )}
                style={{ fontStyle: 'italic' }}
              >
                {info.famous.description}
              </span>
              <button
                type="button"
                className={styles.descToggle}
                onClick={() => setDescExpanded((v) => !v)}
                aria-expanded={descExpanded}
              >
                {descExpanded ? 'show less' : 'show more'}
              </button>
            </div>
          )}
          {info.famous.xref && (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Also catalogued as</span>
              <span className={styles.cardValue}>
                {info.famous.xref.source} row #{info.famous.xref.localIdx}
                {' · '}
                <span style={{ opacity: 0.7, fontSize: '0.85em' }}>
                  {info.famous.xref.distanceArcsec.toFixed(1)}″ from curated position
                </span>
              </span>
            </div>
          )}
          {/*
            Wikipedia link prefers names[1] (NGC/IC slug) over names[0] (Messier
            short id).  Short ids like "M51" / "M109" almost always resolve to a
            disambiguation page or the wrong target (M109 → howitzer).
          */}
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Catalogues</span>
            <span className={styles.cardValue}>
              <a
                className={styles.externalInline}
                href={`https://ned.ipac.caltech.edu/byname?objname=${encodeURIComponent(info.famous.names[0]!)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                NED
              </a>
              {' · '}
              <a
                className={styles.externalInline}
                href={`https://en.wikipedia.org/wiki/${encodeURIComponent((info.famous.names[1] ?? info.famous.names[0]!).replace(/ /g, '_'))}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Wikipedia
              </a>
            </span>
          </div>
        </div>
      )}

      <div className={cx(styles.cardSection, styles.cardTopRow)}>
        <Thumbnail ra={info.ra} dec={info.dec} url={info.thumbnailUrl} />
        <div className={styles.cardSummary}>
          <div className={styles.cardLookbackLine}>
            <InfoTip {...TIPS.lookback!}>Light left</InfoTip> {info.lookbackGyr.toFixed(1)} Gyr ago
          </div>
          <div className={styles.cardLookbackEra}>
            — <InfoTip {...TIPS.earthEra!}>{info.earthEra}</InfoTip>
          </div>
          <div className={styles.cardDistLine}>
            <InfoTip {...TIPS.distance!}>{formatDistance(info.distanceMpc)}</InfoTip> &middot;{' '}
            <InfoTip {...TIPS.hubbleVelocity!}>
              {Math.round(info.hubbleVelocityKmS).toLocaleString()} km/s away
            </InfoTip>
          </div>
          <div className={styles.cardTypeLine}>{info.galaxyType.description}</div>
        </div>
      </div>

      <div className={styles.cardSection}>
        <CardRow
          label={<InfoTip {...TIPS.ra!}>RA</InfoTip>}
          value={
            <>
              {info.raSexagesimal}&nbsp;&nbsp;/&nbsp;&nbsp;{info.ra.toFixed(4)}&deg;
            </>
          }
        />
        <CardRow
          label={<InfoTip {...TIPS.dec!}>Dec</InfoTip>}
          value={
            <>
              {info.decSexagesimal}&nbsp;&nbsp;/&nbsp;&nbsp;{info.dec.toFixed(4)}&deg;
            </>
          }
        />
        <CardRow
          label={<InfoTip {...TIPS.redshift!}>Redshift z</InfoTip>}
          value={info.redshift.toFixed(4)}
        />
        {/* Source-aware band label: 2MRS puts J in the g-slot, GLADE puts B. */}
        <CardRow
          label={<InfoTip {...TIPS.apparentMag!}>{`Apparent mag (${info.bands.g})`}</InfoTip>}
          value={Number.isFinite(info.magG) ? info.magG.toFixed(2) : 'N/A'}
        />
      </div>

      <details>
        <summary className={styles.detailsSummary}>More details</summary>

        <div className={styles.cardSection}>
          <CardRow
            label={<InfoTip {...TIPS.absoluteMag!}>{`Absolute mag (${info.bands.g})`}</InfoTip>}
            value={Number.isFinite(info.absoluteMagG) ? info.absoluteMagG.toFixed(2) : 'N/A'}
          />
          {info.colours.length > 0 && (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>
                <InfoTip {...TIPS.colour!}>Colour</InfoTip>
              </span>
              <span className={styles.cardValue}>
                {info.colours.map((c, idx) => (
                  <span key={c.label}>
                    {idx > 0 && <>&nbsp;&nbsp;</>}
                    {c.label}&nbsp;{c.value.toFixed(2)}
                  </span>
                ))}
              </span>
            </div>
          )}
          <CardRow
            label={<InfoTip {...TIPS.orientation!}>Orientation</InfoTip>}
            value={
              <>
                b/a&nbsp;{info.orientation.axisRatio.toFixed(2)}
                &nbsp;&nbsp;PA&nbsp;{info.orientation.positionAngleDeg.toFixed(0)}&deg;
                <br />
                <span style={{ opacity: 0.7, fontSize: '0.85em' }}>
                  {info.orientation.provenance}
                </span>
              </>
            }
          />
          <CardRow
            label={<InfoTip {...TIPS.diameter!}>Diameter</InfoTip>}
            value={
              <>
                {formatDiameterKpc(info.diameterKpc)}
                <br />
                <span style={{ opacity: 0.7, fontSize: '0.85em' }}>{info.diameterProvenance}</span>
              </>
            }
          />
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>ObjID</span>
            <code className={cx(styles.cardValue, styles.cardObjid)}>{String(info.objID)}</code>
          </div>
        </div>
      </details>

      {info.catalogUrl ? (
        <a className={styles.externalLink} href={info.catalogUrl} target="_blank" rel="noopener">
          {info.source === Source.SDSS ? 'View in SDSS Explorer' : 'View on NED'}
          {' →'}
        </a>
      ) : (
        <div className={cx(styles.externalLink, styles.externalLinkDisabled)}>
          No catalogue page for {info.sourceLabel}
        </div>
      )}
    </div>
  );
}
