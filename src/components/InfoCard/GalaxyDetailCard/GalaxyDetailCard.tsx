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
import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import { formatDistance } from '../../../utils/format/formatDistance';
import { formatDiameterKpc } from '../../../utils/format/formatDiameterKpc';
import { formatLookback } from '../../../utils/format/formatLookback';
import Thumbnail from '../Thumbnail/Thumbnail';
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import DescriptionBlock from '../DescriptionBlock/DescriptionBlock';
import { InfoTip } from '../../InfoTip/InfoTip';
import { TIPS } from '../tooltips';
import styles from '../cardChrome.module.css';
import local from './GalaxyDetailCard.module.css';

export type GalaxyDetailCardProps = {
  target: GalaxyInfo;
  pinned?: boolean;
  chrome?: boolean;
  onFocus?: (target: GalaxyInfo) => void;
  onClose?: () => void;
};

function GalaxyDetailCard({
  target,
  pinned = false,
  chrome = true,
  onFocus,
  onClose,
}: GalaxyDetailCardProps): ReactNode {
  const outerClass = cx(local.root, pinned && styles.pinned, !chrome && styles.chromeless);

  const famousAliases = target.famous?.names.filter((n) => n !== target.displayName) ?? [];

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Galaxy"
        onFocus={pinned && onFocus ? () => onFocus(target) : undefined}
        focusAriaLabel={`Focus camera on ${target.displayName}`}
        onClose={pinned ? onClose : undefined}
      />

      <CardRow type="headline" badge={target.sourceLabel}>
        {target.displayName}
        {famousAliases.map((alias) => (
          <span key={alias} className={styles.headlineAlias}>
            {' · '}
            {alias}
          </span>
        ))}
      </CardRow>

      {target.famous?.description && (
        <div className={styles.cardSection}>
          <DescriptionBlock text={target.famous.description} />
        </div>
      )}

      <div className={cx(styles.cardSection, styles.cardTopRow)}>
        <Thumbnail
          url={target.thumbnailUrl}
          fallbackUrl={target.thumbnailFallbackUrl}
          href={target.skyViewUrl}
          alt="Galaxy thumbnail"
        />
        <div className={styles.cardSummary}>
          <div className={styles.cardLookbackLine}>
            <InfoTip {...TIPS.lookback!}>Light left</InfoTip> {formatLookback(target.lookbackGyr)}{' '}
            ago
          </div>
          <div className={styles.cardLookbackEra}>
            — <InfoTip {...TIPS.earthEra!}>{target.earthEra}</InfoTip>
          </div>
          <div className={styles.cardDistLine}>
            <InfoTip {...TIPS.distance!}>{formatDistance(target.distanceMpc)}</InfoTip> &middot;{' '}
            <InfoTip {...TIPS.hubbleVelocity!}>
              {Math.round(target.hubbleVelocityKmS).toLocaleString()} km/s away
            </InfoTip>
          </div>
          <div className={styles.cardTypeLine}>
            {target.morphology ?? target.galaxyType.description}
          </div>
        </div>
      </div>

      <div className={styles.cardSection}>
        <CardRow
          label="Catalogues"
          value={
            target.catalogues.length > 0 ? (
              target.catalogues.map((link, idx) => (
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
        Above-fold "lean hero": only the figures a casual reader cares about
        after the cosmology summary — the per-source class (Milliquas AGN type,
        DESI tracer population), how far back the redshift puts the galaxy, and
        how physically large it is.  Coordinates, magnitudes, colour, and
        orientation are reference data for the curious and live below the fold.
      */}
      <div className={styles.cardSection}>
        {target.agnClass && (
          <CardRow label={<InfoTip {...TIPS.agnClass!}>Class</InfoTip>} value={target.agnClass} />
        )}
        <CardRow
          label={<InfoTip {...TIPS.redshift!}>Redshift z</InfoTip>}
          value={target.redshift.toFixed(4)}
        />
        <CardRow
          label={<InfoTip {...TIPS.diameter!}>Diameter</InfoTip>}
          value={
            <>
              {formatDiameterKpc(target.diameterKpc)}
              <br />
              <span style={{ opacity: 0.7, fontSize: '0.85em' }}>{target.diameterProvenance}</span>
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
                {target.raSexagesimal}&nbsp;&nbsp;/&nbsp;&nbsp;{target.ra.toFixed(4)}&deg;
              </>
            }
          />
          <CardRow
            label={<InfoTip {...TIPS.dec!}>Dec</InfoTip>}
            value={
              <>
                {target.decSexagesimal}&nbsp;&nbsp;/&nbsp;&nbsp;{target.dec.toFixed(4)}&deg;
              </>
            }
          />
          {/* Rows with no real photometry (DESI LRG/ELG/QSO — their .bin mags
              are synthetic display constants) swap the magnitude rows for the
              builder's note, so a constant is never presented as a measurement. */}
          {target.photometryNote ? (
            <CardRow label="Photometry" value={target.photometryNote} />
          ) : (
            <>
              {/* Source-aware band label: 2MRS puts J in the g-slot, GLADE puts B. */}
              <CardRow
                label={
                  <InfoTip {...TIPS.apparentMag!}>{`Apparent mag (${target.bands.g})`}</InfoTip>
                }
                value={Number.isFinite(target.magG) ? target.magG.toFixed(2) : 'N/A'}
              />
              <CardRow
                label={
                  <InfoTip {...TIPS.absoluteMag!}>{`Absolute mag (${target.bands.g})`}</InfoTip>
                }
                value={
                  Number.isFinite(target.absoluteMagG) ? target.absoluteMagG.toFixed(2) : 'N/A'
                }
              />
              {target.colours.length > 0 && (
                <CardRow
                  label={<InfoTip {...TIPS.colour!}>Colour</InfoTip>}
                  value={target.colours.map((c, idx) => (
                    <span key={c.label}>
                      {idx > 0 && <>&nbsp;&nbsp;</>}
                      {c.label}&nbsp;{c.value.toFixed(2)}
                    </span>
                  ))}
                />
              )}
            </>
          )}
          <CardRow
            label={<InfoTip {...TIPS.orientation!}>Orientation</InfoTip>}
            value={
              <>
                b/a&nbsp;{target.orientation.axisRatio.toFixed(2)}
                &nbsp;&nbsp;PA&nbsp;{target.orientation.positionAngleDeg.toFixed(0)}&deg;
                <br />
                <span style={{ opacity: 0.7, fontSize: '0.85em' }}>
                  {target.orientation.provenance}
                </span>
              </>
            }
          />
          <CardRow
            label="ObjID"
            value={<code className={styles.cardObjid}>{String(target.objID)}</code>}
          />
        </div>
      </details>
    </div>
  );
}

export default GalaxyDetailCard;
