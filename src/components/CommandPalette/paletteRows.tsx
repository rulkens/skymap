/**
 * paletteRows — the JSX table-dispatch vocabulary for the command palette.
 *
 * `ROW_VIEW` turns a `ScoredRow` into its rendered parts (leading visual +
 * primary/secondary text) for the shared <li>, keyed on the row's `kind`.
 *
 * Split from `paletteRowModel` (the non-JSX type/const seam) so the pure
 * ranking pipeline can import the row vocabulary without pulling in React +
 * the CSS module.  A new row kind is one entry here, not a new render branch.
 * Selection routing is NOT here — every row maps to a durable focus id via
 * `utils/focusIdForRow` and fires the single `requestFocus` command.
 *
 * Styling: ROW_VIEW emits the per-row internals into ResultsList's <li>, so it
 * composes ResultsList's module rather than carrying its own — the row styles
 * belong to the one component that renders them.
 */
import type { ReactNode } from 'react';
import { SOURCE_REGISTRY } from '../../data/sources';
import { CATEGORY_DISPLAY_INFO } from '../../data/structure/categoryDisplayInfo';
import { BODY_SEARCH_NAMES } from '../../data/bodies/bodySearchNames';
import { bodyRowChip } from './utils/bodyRowChip';
import { MILKY_WAY_NAMES } from './paletteRowModel';
import type { ScoredRow } from './paletteRowModel';
import styles from './ResultsList.module.css';

/** What InfoCard's row renderer needs, computed per row kind. */
export type RowView = {
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
  // The Milky Way is a procedural backdrop with no atlas WebP, so it renders a
  // first-letter glyph like an alias row, but it is its own row kind.
  milkyWay: () => ({
    key: 'milkyWay',
    testid: 'milky-way-row',
    leading: (
      <span className={styles.glyph} aria-hidden="true">
        {MILKY_WAY_NAMES[0][0]}
      </span>
    ),
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
  // Scene-body row — letter glyph like the Milky Way (no atlas thumb for a
  // procedurally-rendered sphere). Aliases come from the same lookup the ranker
  // scores over, so a row shows exactly the names it can be found by; the chip
  // is the body's constellation or, failing that, its scale regime (e.g.
  // "Alpha Canis Majoris · … · Canis Major", or "Sagittarius A* · Galactic
  // Centre").
  body: (m) => {
    if (m.kind !== 'body') return EMPTY_ROW_VIEW;
    const aliases = (BODY_SEARCH_NAMES.get(m.body.id) ?? []).slice(1);
    const chip = bodyRowChip(m.body.id, m.body.label);
    return {
      key: `body:${m.body.id}`,
      testid: `body-row-${m.body.id}`,
      leading: (
        <span className={styles.glyph} aria-hidden="true">
          {m.body.label[0] ?? '·'}
        </span>
      ),
      primary: m.body.label,
      secondary: (
        <>
          {aliases.length > 0 && <span className={styles.secondary}>{aliases.join(' · ')}</span>}
          {chip && <span className={styles.source}>{chip}</span>}
        </>
      ),
    };
  },
  // Structure row — glyph placeholder like an alias (no atlas thumb) + a
  // category chip (Cluster / Supercluster / Void / Group) from the per-category
  // display copy, plus the Abell designation as a secondary name when present.
  structure: (m) => {
    if (m.kind !== 'structure') return EMPTY_ROW_VIEW;
    const { id, name, category, abell } = m.entry;
    return {
      key: `structure:${id}`,
      testid: `structure-row-${id}`,
      leading: (
        <span className={styles.glyph} aria-hidden="true">
          {name[0] ?? '·'}
        </span>
      ),
      primary: name,
      secondary: (
        <>
          {abell !== null && abell !== name && <span className={styles.secondary}>{abell}</span>}
          <span className={styles.source}>{CATEGORY_DISPLAY_INFO[category].shortLabel}</span>
        </>
      ),
    };
  },
};
