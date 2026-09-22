/**
 * paletteRows — the JSX table-dispatch vocabulary for the command palette.
 *
 * `ROW_VIEW` turns a `ScoredRow` into its rendered parts (leading visual +
 * primary/secondary text) for the shared <li>, keyed on the row's `kind`.
 *
 * Split from `paletteRowModel` (the non-JSX type/const seam) so the pure
 * ranking pipeline can import the row vocabulary without pulling in React +
 * the CSS module.  A new row kind is one entry here, not a new render branch.
 * Selection routing is NOT here — every row maps to a `PaletteAction` via
 * `utils/actionForRow`, and the container dispatches on `action.kind`.
 *
 * Styling: ROW_VIEW emits the per-row internals into ResultsList's <li>, so it
 * composes ResultsList's module rather than carrying its own — the row styles
 * belong to the one component that renders them.
 */
import type { ReactNode } from 'react';
import { SOURCE_REGISTRY } from '../../data/sources';
import { CATEGORY_DISPLAY_INFO } from '../../data/structure/categoryDisplayInfo';
import { BODY_SEARCH_NAMES } from '../../data/bodies/bodySearchNames';
import { CARD_IMAGE_DIR } from '../../data/palette/cardImageDir';
import { CARD_SHOT_BY_FOCUS_ID } from '../../data/palette/cardShotByFocusId';
import { bodyRowChip } from './utils/bodyRowChip';
import { actionForRow } from './utils/actionForRow';
import { MILKY_WAY_NAMES } from './paletteRowModel';
import type { ScoredRow } from './paletteRowModel';
import styles from './ResultsList.module.css';

/**
 * A milkyWay/body/star/structure row's leading visual: the captured card shot
 * of the featured card that names the same focus id `actionForRow` resolves to
 * (the id grammar the URL deep-link layer uses), else today's letter glyph.
 */
function shotOrGlyph(row: ScoredRow, label: string): ReactNode {
  const action = actionForRow(row);
  const shot = action.kind === 'focus' ? CARD_SHOT_BY_FOCUS_ID.get(action.focusId) : undefined;
  if (shot !== undefined) {
    return (
      <img className={styles.thumb} src={`${CARD_IMAGE_DIR}/${shot}.webp`} alt="" loading="lazy" />
    );
  }
  return (
    <span className={styles.glyph} aria-hidden="true">
      {label[0] ?? '·'}
    </span>
  );
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
 * ROW_VIEW — table dispatch from a ScoredRow kind to its rendered parts, keyed
 * on `m.kind`. The list renderer wraps every row in one identical <li> (active
 * styling, hover, click → dispatchSelection); this table only supplies the
 * kind-specific leading visual + primary/secondary text. Each row narrows `m`
 * on `kind` (the fallback RowView is unreachable — the table is indexed by the
 * row's own tag). A new row kind is one entry here, not a new render branch.
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
          primary: m.entry.names[0],
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
    primary: MILKY_WAY_NAMES[0],
    secondary: <span className={styles.secondary}>{MILKY_WAY_NAMES.slice(1).join(' · ')}</span>,
  }),
  // Alias row — no thumbnail (we don't pre-render NGC galaxies); letter-glyph
  // placeholder + source-label chip so GLADE vs 2MRS reads at a glance.
  alias: (m) => {
    if (m.kind !== 'alias') return EMPTY_ROW_VIEW;
    const primary = m.entry.names[0] ?? '(unnamed)';
    const remaining = m.entry.names.slice(1);
    return {
      key: `alias:${m.entry.source}:${m.entry.localIdx}`,
      testid: `alias-row-${m.entry.localIdx}`,
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
  body: (m) => {
    if (m.kind !== 'body') return EMPTY_ROW_VIEW;
    const aliases = (BODY_SEARCH_NAMES.get(m.body.id) ?? []).slice(1);
    const chip = bodyRowChip(m.body.id, m.body.label);
    return {
      key: `body:${m.body.id}`,
      testid: `body-row-${m.body.id}`,
      leading: shotOrGlyph(m, m.body.label),
      primary: m.body.label,
      secondary: (
        <>
          {aliases.length > 0 && <span className={styles.secondary}>{aliases.join(' · ')}</span>}
          {chip && <span className={styles.source}>{chip}</span>}
        </>
      ),
    };
  },
  starCatalog: (m) => {
    if (m.kind !== 'starCatalog') return EMPTY_ROW_VIEW;
    const aliases = (BODY_SEARCH_NAMES.get(m.star.id) ?? []).slice(1);
    const chip = bodyRowChip(m.star.id, m.star.label);
    return {
      key: `starCatalog:${m.star.id}`,
      testid: `star-row-${m.star.id}`,
      leading: shotOrGlyph(m, m.star.label),
      primary: m.star.label,
      secondary: (
        <>
          {aliases.length > 0 && <span className={styles.secondary}>{aliases.join(' · ')}</span>}
          {chip && <span className={styles.source}>{chip}</span>}
        </>
      ),
    };
  },
  // Structure row — captured card shot when one exists (see `shotOrGlyph`),
  // else a glyph placeholder, + a category chip (Cluster / Supercluster /
  // Void / Group) from the per-category display copy, plus the Abell
  // designation as a secondary name when present.
  structure: (m) => {
    if (m.kind !== 'structure') return EMPTY_ROW_VIEW;
    const { id, name, category, abell } = m.entry;
    return {
      key: `structure:${id}`,
      testid: `structure-row-${id}`,
      leading: shotOrGlyph(m, name),
      primary: name,
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
      primary: m.exhibit.label,
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
      primary: m.tour.label,
      secondary: <span className={styles.source}>Tour</span>,
    };
  },
  // Earth-place row — letter glyph (no captured shot for these) + a fixed
  // 'Earth' chip, since every row here is on the one body.
  place: (m) => {
    if (m.kind !== 'place') return EMPTY_ROW_VIEW;
    const primary = m.entry.names[0] ?? '(unnamed)';
    const aliases = m.entry.names.slice(1);
    return {
      key: `place:${m.entry.id}`,
      testid: `place-row-${m.entry.id}`,
      leading: (
        <span className={styles.glyph} aria-hidden="true">
          {primary[0] ?? '·'}
        </span>
      ),
      primary,
      secondary: (
        <>
          {aliases.length > 0 && <span className={styles.secondary}>{aliases.join(' · ')}</span>}
          <span className={styles.source}>Earth</span>
        </>
      ),
    };
  },
};
