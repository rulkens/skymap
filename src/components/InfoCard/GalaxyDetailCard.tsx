/**
 * GalaxyDetailCard — rich panel for a focused galaxy: thumbnail, cosmology
 * summary, coordinates, expandable details, external link.
 *
 * The outer wrapper's tag + className stays stable across galaxy hover ↔ pin
 * transitions so the native `<details>` "More details" open state survives
 * via DOM identity (no React-state lifting needed).
 */

import type { ReactNode } from 'react';
import { useState } from 'react';
import cx from 'classnames';
import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import { Source } from '../../data/sources';
import { formatDistance, formatDiameterKpc } from '../../utils/format/distance';
import { Thumbnail } from './Thumbnail';
import { famousWikipediaTitle } from './famousWikipediaTitle';
import { CardHeader } from './CardHeader';
import { CardRow } from './CardRow';
import { InfoTip } from '../InfoTip/InfoTip';
import { TIPS } from './tooltips';
import styles from './DetailCard.module.css';

export type GalaxyDetailCardProps = {
  info: GalaxyInfo;
  pinned?: boolean;
  onFocus?: (info: GalaxyInfo) => void;
  onClose?: () => void;
};

export function GalaxyDetailCard({
  info,
  pinned = false,
  onFocus,
  onClose,
}: GalaxyDetailCardProps): ReactNode {
  const [descExpanded, setDescExpanded] = useState(false);

  const outerClass = pinned
    ? `${styles.infoCardFull} ${styles.pinned}`
    : styles.infoCardFull;

  const famousAliases =
    info.famous?.names.filter((n) => n !== info.displayName) ?? [];

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Galaxy"
        onFocus={pinned && onFocus ? () => onFocus(info) : undefined}
        focusAriaLabel={`Focus camera on ${info.displayName}`}
        onClose={pinned ? onClose : undefined}
      />

      <div className={styles.cardHeadline}>
        {info.displayName}
        {famousAliases.map((alias) => (
          <span key={alias} className={styles.headlineAlias}>
            {' · '}
            {alias}
          </span>
        ))}
      </div>
      <div className={styles.sourceBadge}>{info.sourceLabel}</div>

      {info.famous && (
        <div className={styles.cardSection}>
          {info.famous.description && (
            // Description prose stacked above its show-more toggle — a column,
            // not the label/value CardRow shape, so the toggle sits underneath
            // the text rather than floating to its right.
            <div className={styles.descBlock}>
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
          {/*
            Wikipedia article slug comes from `famousWikipediaTitle`, which
            prefers the NGC/IC designation: Messier short ids ("M51"/"M109")
            hit disambiguation pages, and non-M/C aliases (UGC/PGC/KPG) have no
            article at all.  NED resolves any of the names, so it keeps names[0].
          */}
          <CardRow
            label="Catalogues"
            value={
              <>
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
                  href={`https://en.wikipedia.org/wiki/${encodeURIComponent(famousWikipediaTitle(info.famous.names).replace(/ /g, '_'))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Wikipedia
                </a>
              </>
            }
          />
        </div>
      )}

      <div className={cx(styles.cardSection, styles.cardTopRow)}>
        <Thumbnail
          key={info.thumbnailUrl}
          ra={info.ra}
          dec={info.dec}
          url={info.thumbnailUrl}
          fallbackUrl={info.thumbnailFallbackUrl}
        />
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
            <CardRow
              label={<InfoTip {...TIPS.colour!}>Colour</InfoTip>}
              value={info.colours.map((c, idx) => (
                <span key={c.label}>
                  {idx > 0 && <>&nbsp;&nbsp;</>}
                  {c.label}&nbsp;{c.value.toFixed(2)}
                </span>
              ))}
            />
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
          <CardRow
            label="ObjID"
            value={<code className={styles.cardObjid}>{String(info.objID)}</code>}
          />
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
