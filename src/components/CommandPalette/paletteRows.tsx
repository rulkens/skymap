/**
 * paletteRows — the JSX table-dispatch vocabulary for the command palette:
 * `ROW_VIEW` turns a `ScoredRow` into its rendered parts for the shared <li>,
 * keyed on `kind`. `ScoredRow` and `MILKY_WAY_NAMES` live outside this module so
 * the pure ranking pipeline imports them without React. Selection routing is in
 * `utils/palette/actionForRow`. ROW_VIEW composes ResultsList's CSS module, the
 * one component that renders these rows.
 */
import type { ReactNode } from 'react';
import { SOURCE_REGISTRY } from '../../data/sources';
import { CATEGORY_DISPLAY_INFO } from '../../data/structure/categoryDisplayInfo';
import { BODY_SEARCH_NAMES } from '../../data/bodies/bodySearchNames';
import { structureShotUrl } from '../../utils/structure/structureShotUrl';
import { cardShotUrl } from '../../utils/palette/cardShotUrl';
import { SHOT_CARD_IDS } from '../../data/palette/shotCardIds';
import { bodyRowChip } from './utils/bodyRowChip';
import { actionForRow } from '../../utils/palette/actionForRow';
import { paletteRowLabel } from '../../utils/palette/paletteRowLabel';
import { MILKY_WAY_NAMES } from '../../data/palette/milkyWayNames';
import type { ScoredRow } from '../../@types/palette/ScoredRow';
import styles from './ResultsList.module.css';

/** A row's leading visual: its captured shot when it has one, else a letter glyph. */
function thumbOrGlyph(shotUrl: string | undefined, label: string): ReactNode {
  if (shotUrl !== undefined) {
    return <img className={styles.thumb} src={shotUrl} alt="" loading="lazy" />;
  }
  return (
    <span className={styles.glyph} aria-hidden="true">
      {label[0] ?? '·'}
    </span>
  );
}

/**
 * A milkyWay/body/star row's leading visual: the captured card shot of the
 * featured card that names the same focus id `actionForRow` resolves to (the
 * id grammar the URL deep-link layer uses), else the letter glyph.
 */
function shotOrGlyph(row: ScoredRow, label: string): ReactNode {
  const action = actionForRow(row);
  const hasShot = action.kind === 'focus' && SHOT_CARD_IDS.has(action.focusId);
  return thumbOrGlyph(hasShot ? cardShotUrl(action.focusId) : undefined, label);
}

/** What InfoCard's row renderer needs, computed per row kind. */
type RowView = {
  readonly key: string;
  readonly testid?: string;
  readonly leading: ReactNode;
  readonly primary: ReactNode;
  readonly secondary: ReactNode;
};

const EMPTY_ROW_VIEW: RowView = { key: '', leading: null, primary: null, secondary: null };

/**
 * Shared render for the `body` and `starCatalog` arms below — they differ
 * only in which `ScoredRow` field they read the id/label from, everything
 * else (aliases, constellation/scale chip, captured-shot leading visual) is
 * identical, so one row shape serves both kinds.
 */
function namedRowView(m: ScoredRow, keyPrefix: string, testidPrefix: string, id: string): RowView {
  const label = paletteRowLabel(m).name;
  const aliases = (BODY_SEARCH_NAMES.get(id) ?? []).slice(1);
  const chip = bodyRowChip(id);
  return {
    key: `${keyPrefix}:${id}`,
    testid: `${testidPrefix}-${id}`,
    leading: shotOrGlyph(m, label),
    primary: label,
    secondary: (
      <>
        {aliases.length > 0 && <span className={styles.secondary}>{aliases.join(' · ')}</span>}
        {chip && <span className={styles.source}>{chip}</span>}
      </>
    ),
  };
}

const EARTH_CHIP = <span className={styles.source}>Earth</span>;

/**
 * Shared render for the `place` and `layer` arms: a letter glyph, the first
 * name, the rest as aliases, and an optional source chip. Neither kind has a
 * thumbnail to look up, so the two differ only in that chip.
 */
function glyphRowView(
  m: Extract<ScoredRow, { kind: 'place' | 'layer' }>,
  chip?: ReactNode,
): RowView {
  const primary = paletteRowLabel(m).name;
  const aliases = m.entry.names.slice(1);
  return {
    key: `${m.kind}:${m.entry.id}`,
    testid: `${m.kind}-row-${m.entry.id}`,
    leading: (
      <span className={styles.glyph} aria-hidden="true">
        {primary[0] ?? '·'}
      </span>
    ),
    primary,
    secondary: (
      <>
        {aliases.length > 0 && <span className={styles.secondary}>{aliases.join(' · ')}</span>}
        {chip}
      </>
    ),
  };
}

/**
 * ROW_VIEW — kind-specific leading visual and primary/secondary text; the list
 * renderer wraps every row in one identical <li>. The fallback RowView is
 * unreachable (the table is indexed by the row's own tag).
 */
export const ROW_VIEW: Record<ScoredRow['kind'], (m: ScoredRow) => RowView> = {
  famous: (m) =>
    m.kind === 'famous'
      ? {
          key: `famous:${m.entry.id}`,
          leading: (
            <img
              className={styles.thumb}
              src={`/images/famous/${m.entry.id}.webp`}
              alt=""
              loading="lazy"
            />
          ),
          primary: paletteRowLabel(m).name,
          secondary:
            m.entry.names.length > 1 ? (
              <span className={styles.secondary}>{m.entry.names.slice(1).join(' · ')}</span>
            ) : null,
        }
      : EMPTY_ROW_VIEW,
  // The Milky Way is a procedural backdrop with no atlas WebP; it renders its
  // captured card shot (see `shotOrGlyph`) or falls back to a letter glyph.
  milkyWay: (m) => ({
    key: 'milkyWay',
    testid: 'milky-way-row',
    leading: shotOrGlyph(m, MILKY_WAY_NAMES[0]),
    primary: paletteRowLabel(m).name,
    secondary: <span className={styles.secondary}>{MILKY_WAY_NAMES.slice(1).join(' · ')}</span>,
  }),
  // Alias row — no thumbnail (we don't pre-render NGC galaxies); letter-glyph
  // placeholder + source-label chip so GLADE vs 2MRS reads at a glance.
  alias: (m) => {
    if (m.kind !== 'alias') return EMPTY_ROW_VIEW;
    const primary = paletteRowLabel(m).name;
    const remaining = m.entry.names.slice(1);
    return {
      key: `alias:${m.entry.source}:${m.entry.pgc}`,
      testid: `alias-row-${m.entry.source}-${m.entry.pgc}`,
      leading: (
        <span className={styles.glyph} aria-hidden="true">
          {primary[0] ?? '·'}
        </span>
      ),
      primary,
      secondary: (
        <>
          {remaining.length > 0 && (
            <span className={styles.secondary}>{remaining.join(' · ')}</span>
          )}
          <span className={styles.source}>{SOURCE_REGISTRY[m.entry.source].label}</span>
        </>
      ),
    };
  },
  // Scene-body row — captured card shot when one exists (see `shotOrGlyph`),
  // else a letter glyph. Aliases come from the same lookup the ranker scores
  // over, so a row shows exactly the names it can be found by; the chip is
  // the body's constellation or, failing that, its scale regime (e.g.
  // "Alpha Canis Majoris · … · Canis Major", or "Sagittarius A* · Galactic
  // Centre"). A seeded star's row renders identically — same lookups, same
  // chip — off its own star identity.
  body: (m) =>
    m.kind !== 'body' ? EMPTY_ROW_VIEW : namedRowView(m, 'body', 'body-row', m.body.id),
  starCatalog: (m) =>
    m.kind !== 'starCatalog'
      ? EMPTY_ROW_VIEW
      : namedRowView(m, 'starCatalog', 'star-row', m.star.id),
  // Structure row — the captured shot of a featured anchor (bulk rows have none),
  // else a glyph placeholder, + a category chip (Cluster / Supercluster /
  // Void / Group) from the per-category display copy, plus the Abell
  // designation as a secondary name when present.
  structure: (m) => {
    if (m.kind !== 'structure') return EMPTY_ROW_VIEW;
    const { id, name, category, abell } = m.entry;
    return {
      key: `structure:${id}`,
      testid: `structure-row-${id}`,
      leading: thumbOrGlyph(m.entry.featured ? structureShotUrl(id) : undefined, name),
      primary: paletteRowLabel(m).name,
      secondary: (
        <>
          {abell !== null && abell !== name && <span className={styles.secondary}>{abell}</span>}
          <span className={styles.source}>{CATEGORY_DISPLAY_INFO[category].shortLabel}</span>
        </>
      ),
    };
  },
  // Exhibit row — letter glyph like the Milky Way (no atlas thumb: an exhibit
  // is a scene takeover, not a picturable object).
  exhibit: (m) => {
    if (m.kind !== 'exhibit') return EMPTY_ROW_VIEW;
    return {
      key: `exhibit:${m.exhibit.id}`,
      testid: `exhibit-row-${m.exhibit.id}`,
      leading: (
        <span className={styles.glyph} aria-hidden="true">
          {m.exhibit.label[0] ?? '·'}
        </span>
      ),
      primary: paletteRowLabel(m).name,
      secondary: <span className={styles.source}>Exhibit</span>,
    };
  },
  // Tour row — same glyph treatment as an exhibit; a tour is a beat sequence,
  // not a picturable object either.
  tour: (m) => {
    if (m.kind !== 'tour') return EMPTY_ROW_VIEW;
    return {
      key: `tour:${m.tour.id}`,
      testid: `tour-row-${m.tour.id}`,
      leading: (
        <span className={styles.glyph} aria-hidden="true">
          {m.tour.label[0] ?? '·'}
        </span>
      ),
      primary: paletteRowLabel(m).name,
      secondary: <span className={styles.source}>Tour</span>,
    };
  },
  // Layer-published row — no thumbnail vocabulary to look up, and no chip: the
  // publishing Layer is not a source label the user would recognise.
  layer: (m) => (m.kind !== 'layer' ? EMPTY_ROW_VIEW : glyphRowView(m)),
  // Earth-place row — the same shape plus a fixed 'Earth' chip, since every row
  // here is on the one body.
  place: (m) => (m.kind !== 'place' ? EMPTY_ROW_VIEW : glyphRowView(m, EARTH_CHIP)),
};
