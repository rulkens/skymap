/**
 * CompactPoiCard — POI variant of `CompactCard`.
 *
 * Rendered as a slim hover-preview panel below a pinned card (or
 * standalone when nothing is pinned) when the user hovers a cluster /
 * supercluster / void ring.  Mirrors the galaxy `CompactCard`'s visual
 * weight (single panel, "Hover" eyebrow, no expandable section, no
 * action buttons) so the two hover previews feel like the same surface.
 *
 * ### Why a sibling file instead of generalising `CompactCard<T>`
 *
 * Premature generalisation: there are only two compact variants today
 * (galaxy + POI), they share less than half their content fields
 * (different distance derivation, different secondary line), and a
 * generic `CompactCard<T>` with a `renderContent` slot would obscure
 * what each variant actually renders.  Two small files are easier to
 * scan than one slot-driven abstraction.  Revisit if a third variant
 * ever appears.
 *
 * ### Why `poiCategoryLabel` is inlined, not imported from FullCard
 *
 * Loose coupling — the FullCard's `poiCategoryLabel` is a private
 * implementation detail of that file, not a shared utility.  The
 * compact card is meant to be independent of the full card so the two
 * can evolve in lockstep without touching each other (different visual
 * weight, possibly different future field sets).  The two short
 * switch statements can drift if a future tweak only touches one
 * place — that's the explicit price of independence, not a bug.
 *
 * All layout comes from CompactPoiCard.module.css; class names mirror
 * `CompactCard.module.css` via `composes:` so the two variants share
 * chrome rules without copy-paste.
 */

import type { ReactNode } from 'react';
import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';
import { formatDistance } from '../../utils/format/distance';
import styles from './CompactPoiCard.module.css';

// ── poiCategoryLabel ──────────────────────────────────────────────────────────

/**
 * Human-readable label for a POI category.  Inlined here rather than
 * imported from FullCard.tsx — see module header for the loose-coupling
 * rationale.
 */
function poiCategoryLabel(category: PointOfInterest['category']): string {
  switch (category) {
    case 'cluster':
      return 'Cluster';
    case 'supercluster':
      return 'Supercluster';
    case 'void':
      return 'Void';
    case 'famousGalaxy':
      return 'Galaxy';
  }
}

// ── Props ──────────────────────────────────────────────────────────────────────

/** Props for CompactPoiCard. */
export type CompactPoiCardProps = {
  poi: PointOfInterest;
};

// ── CompactPoiCard ────────────────────────────────────────────────────────────

/**
 * The slim hover-preview card rendered when the user hovers a cluster /
 * supercluster / void ring.
 *
 * Fields shown: POI name, category badge, distance from observer, and
 * physical radius (when set).  No lookback / era line — POIs are
 * abstract regions, not specific photon sources, so there's no
 * time-of-flight to display.
 *
 * @example
 * // Inside InfoCard (when hoveredPoi is set and not the same as selectedPoi):
 * <CompactPoiCard poi={hoveredPoi} />
 */
export function CompactPoiCard({ poi }: CompactPoiCardProps): ReactNode {
  // Distance from observer (origin) — POIs live in heliocentric world
  // space, so |worldPos| is the observer-to-POI distance.  Same calc
  // FullCard's POI body (renderPoiBody in FullCard.tsx) uses.  We
  // duplicate the one-line `Math.hypot` here rather than extracting a
  // shared helper because the calc IS the data — no semantic content
  // beyond "magnitude of the position vector".
  const distanceMpc = Math.hypot(poi.worldPos[0], poi.worldPos[1], poi.worldPos[2]);

  return (
    <div className={styles.infoCardCompact} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <div className={styles.cardHeadline}>{poi.name}</div>
      {/*
        Reuses the sourceBadge styling for visual consistency with both
        the galaxy CompactCard's catalog badge and the FullCard POI
        body's category badge.  Same shape (small pill), different
        semantic content (category label here vs survey label in the
        galaxy variant).
      */}
      <div className={styles.sourceBadge}>{poiCategoryLabel(poi.category)}</div>
      <div className={styles.cardDistLine}>
        {formatDistance(distanceMpc)}
        {poi.physicalRadiusMpc !== undefined && (
          <>
            {' '}
            &middot; r {formatDistance(poi.physicalRadiusMpc)}
          </>
        )}
      </div>
    </div>
  );
}
