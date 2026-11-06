/**
 * GalaxyDetailCard — rich panel for a focused galaxy: name + galaxy catalog badge,
 * curated description and morphology (a famous galaxy's sidecar entry, joined by
 * its container), catalogue links, thumbnail + cosmology summary, and an
 * expandable block of reference figures.
 *
 * The outer wrapper's tag + className stays stable across galaxy hover ↔ pin
 * transitions so the native `<details>` "More details" open state survives
 * via DOM identity (no React-state lifting needed).
 */

import { Fragment, type ReactNode } from 'react';
import cx from 'classnames';
import type { GalaxyInfo } from '../../../../../@types/engine/GalaxyInfo';
import type { FamousGalaxyMetaEntry } from '../../../../../@types/loading/FamousGalaxyMetaEntry';
import { formatMorphology } from '../../../../../utils/format/formatMorphology';
import { formatDistance } from '../../../../../utils/format/formatDistance';
import { formatDiameterKpc } from '../../../../../utils/format/formatDiameterKpc';
import { formatLookback } from '../../../../../utils/format/formatLookback';
import Thumbnail from '../../../../../components/InfoCard/Thumbnail/Thumbnail';
import CardHeader from '../../../../../components/InfoCard/CardHeader/CardHeader';
import CardRow from '../../../../../components/InfoCard/CardRow/CardRow';
import DescriptionBlock from '../../../../../components/InfoCard/DescriptionBlock/DescriptionBlock';
import { InfoTip } from '../../../../../components/InfoTip/InfoTip';
import { TIPS } from '../../../../../components/InfoCard/tooltips';
import { GALAXY_TIPS } from '../galaxyTips';
import type { CardLayout } from '../../../../../@types/components/infoCard/CardLayout';
import styles from '../../../../../components/InfoCard/cardChrome.module.css';
import local from './GalaxyDetailCard.module.css';

export type GalaxyDetailCardProps = {
  target: GalaxyInfo;
  /** A famous galaxy's sidecar entry, once it has landed. */
  curated?: FamousGalaxyMetaEntry;
  isPinned?: boolean;
  layout?: CardLayout;
  onFocus?: () => void;
  onClose?: () => void;
};

function GalaxyDetailCard({
  target,
  curated,
  isPinned = false,
  layout = 'panel',
  onFocus,
  onClose,
}: GalaxyDetailCardProps): ReactNode {
  const outerClass = cx(
    local.root,
    isPinned && styles.pinned,
    layout === 'phone' && styles.chromeless,
  );

  const famousAliases = target.famous?.names.filter((n) => n !== target.displayName) ?? [];
  const thumbnail = (
    <Thumbnail
      url={target.thumbnailUrl}
      fallbackUrl={target.thumbnailFallbackUrl}
      href={target.skyViewUrl}
      alt="Galaxy thumbnail"
    />
  );

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        layout={layout}
        eyebrow="Galaxy"
        title={
          <>
            {target.displayName}
            {famousAliases.map((alias) => (
              <span key={alias} className={styles.headlineAlias}>
                {' · '}
                {alias}
              </span>
            ))}
          </>
        }
        badge={target.sourceLabel}
        thumbnail={thumbnail}
        onFocus={isPinned ? onFocus : undefined}
        focusAriaLabel={`Focus camera on ${target.displayName}`}
        onClose={isPinned ? onClose : undefined}
      />

      {curated?.description && (
        <div className={styles.cardSection}>
          <DescriptionBlock text={curated.description} />
        </div>
      )}

      <div className={cx(styles.cardSection, styles.cardTopRow)}>
        {layout === 'panel' && thumbnail}
        <div className={styles.cardSummary}>
          <div className={styles.cardLookbackLine}>
            <InfoTip {...GALAXY_TIPS.lookback}>Light left</InfoTip>{' '}
            {formatLookback(target.lookbackGyr)} ago
          </div>
          <div className={styles.cardLookbackEra}>
            — <InfoTip {...GALAXY_TIPS.earthEra}>{target.earthEra}</InfoTip>
          </div>
          <div className={styles.cardDistLine}>
            <InfoTip {...GALAXY_TIPS.distance}>{formatDistance(target.distanceMpc)}</InfoTip>{' '}
            &middot;{' '}
            <InfoTip {...GALAXY_TIPS.hubbleVelocity}>
              {Math.round(target.hubbleVelocityKmS).toLocaleString()} km/s away
            </InfoTip>
          </div>
          <div className={styles.cardTypeLine}>
            {curated?.type ? formatMorphology(curated.type) : target.galaxyType.description}
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
          <CardRow
            label={<InfoTip {...GALAXY_TIPS.agnClass}>Class</InfoTip>}
            value={target.agnClass}
          />
        )}
        <CardRow
          label={<InfoTip {...GALAXY_TIPS.redshift}>Redshift z</InfoTip>}
          value={target.redshift.toFixed(4)}
        />
        <CardRow
          label={<InfoTip {...TIPS.diameter}>Diameter</InfoTip>}
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
            label={<InfoTip {...GALAXY_TIPS.ra}>RA</InfoTip>}
            value={
              <>
                {target.raSexagesimal}&nbsp;&nbsp;/&nbsp;&nbsp;{target.ra.toFixed(4)}&deg;
              </>
            }
          />
          <CardRow
            label={<InfoTip {...GALAXY_TIPS.dec}>Dec</InfoTip>}
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
                  <InfoTip
                    {...GALAXY_TIPS.apparentMag}
                  >{`Apparent mag (${target.bands.g})`}</InfoTip>
                }
                value={Number.isFinite(target.magG) ? target.magG.toFixed(2) : 'N/A'}
              />
              <CardRow
                label={
                  <InfoTip
                    {...GALAXY_TIPS.absoluteMag}
                  >{`Absolute mag (${target.bands.g})`}</InfoTip>
                }
                value={
                  Number.isFinite(target.absoluteMagG) ? target.absoluteMagG.toFixed(2) : 'N/A'
                }
              />
              {target.colours.length > 0 && (
                <CardRow
                  label={<InfoTip {...GALAXY_TIPS.colour}>Colour</InfoTip>}
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
            label={<InfoTip {...GALAXY_TIPS.orientation}>Orientation</InfoTip>}
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
