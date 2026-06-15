/**
 * GalaxyDetailCard — rich panel for a focused galaxy: name + galaxy catalog badge,
 * curated description (famous only), catalogue links, thumbnail + cosmology
 * summary, and an expandable block of reference figures.
 *
 * The outer wrapper's tag + className stays stable across galaxy hover ↔ pin
 * transitions so the native `<details>` "More details" open state survives
 * via DOM identity (no React-state lifting needed).
 */

import { Fragment, type ReactNode } from 'react';
import cx from 'classnames';
import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import { formatDistance, formatDiameterKpc } from '../../utils/format/distance';
import { Thumbnail } from './Thumbnail';
import { CardHeader } from './CardHeader';
import { CardRow } from './CardRow';
import { DescriptionBlock } from './DescriptionBlock';
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
  const outerClass = pinned ? `${styles.infoCardFull} ${styles.pinned}` : styles.infoCardFull;

  const famousAliases = info.famous?.names.filter((n) => n !== info.displayName) ?? [];

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Galaxy"
        onFocus={pinned && onFocus ? () => onFocus(info) : undefined}
        focusAriaLabel={`Focus camera on ${info.displayName}`}
        onClose={pinned ? onClose : undefined}
      />

      <div className={styles.headlineRow}>
        <div className={styles.cardHeadline}>
          {info.displayName}
          {famousAliases.map((alias) => (
            <span key={alias} className={styles.headlineAlias}>
              {' · '}
              {alias}
            </span>
          ))}
        </div>
        <span className={styles.sourceBadge}>{info.sourceLabel}</span>
      </div>

      {info.famous?.description && (
        <div className={styles.cardSection}>
          <DescriptionBlock text={info.famous.description} />
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
          <div className={styles.cardTypeLine}>
            {info.morphology ?? info.galaxyType.description}
          </div>
        </div>
      </div>

      <div className={styles.cardSection}>
        <CardRow
          label="Catalogues"
          value={
            info.catalogues.length > 0 ? (
              info.catalogues.map((link, idx) => (
                <Fragment key={link.label}>
                  {idx > 0 && ' · '}
                  <a
                    className={styles.externalInline}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                  </a>
                </Fragment>
              ))
            ) : (
              <span className={styles.catalogueNone}>Not catalogued</span>
            )
          }
        />
      </div>

      {/*
        Above-fold "lean hero": only the two figures a casual reader cares about
        after the cosmology summary — how far back the redshift puts the galaxy,
        and how physically large it is.  Coordinates, magnitudes, colour, and
        orientation are reference data for the curious and live below the fold.
      */}
      <div className={styles.cardSection}>
        <CardRow
          label={<InfoTip {...TIPS.redshift!}>Redshift z</InfoTip>}
          value={info.redshift.toFixed(4)}
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
      </div>

      <details>
        <summary className={styles.detailsSummary}>More details</summary>

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
          {/* Source-aware band label: 2MRS puts J in the g-slot, GLADE puts B. */}
          <CardRow
            label={<InfoTip {...TIPS.apparentMag!}>{`Apparent mag (${info.bands.g})`}</InfoTip>}
            value={Number.isFinite(info.magG) ? info.magG.toFixed(2) : 'N/A'}
          />
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
            label="ObjID"
            value={<code className={styles.cardObjid}>{String(info.objID)}</code>}
          />
        </div>
      </details>
    </div>
  );
}
