/**
 * CommandPalette — Cmd+K (or Ctrl+K, or `/`) overlay for searching
 * across two parallel indexes:
 *
 *   1. The curated famous-galaxies atlas (`entries`, ~75 hand-picked).
 *   2. The PGC-keyed alias index (`aliasIndex`, ~48k GLADE+2MRS rows
 *      with NGC/IC/UGC/M/etc. cross-references from HyperLEDA).
 *
 * UX:
 *   - Triggered by a keyboard shortcut (handled in App.tsx).
 *   - Famous matches always rank above alias matches at equal score.
 *   - Alias matches are capped at 50 per query so a query that hits
 *     "MCG" (which matches thousands of rows) doesn't drown the famous
 *     hits or balloon the DOM.
 *   - Up/Down arrows move the highlight; Enter selects.
 *   - Esc closes without action.
 *   - Click outside the panel closes.
 *
 * Selection: the row's onClick / Enter handler calls either
 * `onSelect(id)` (famous) or `onSelectAlias({ source, localIdx })`
 * (alias) — App.tsx routes those to engine.selectFamous or
 * engine.selectByAlias respectively.
 *
 * Why not a third-party command-palette library?  Same reasoning as
 * the original famous-only iteration: ~120 lines of UI logic, no
 * value-add from cmdk/kbar, and the project bans component-level
 * barrel exports many of those libraries assume.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { scoreFamousMatch } from './scoreFamousMatch';
import { scoreAliasMatch } from './scoreAliasMatch';
import type { FamousMetaEntry } from '../../services/engine/famousMetaLoader';
import type { AliasIndexEntry } from '../../services/engine/pgcAliasLoader';
import { Source, sourceLabel } from '../../data/sources';
import { InfoTip } from '../InfoTip/InfoTip';
import styles from './CommandPalette.module.css';

/**
 * Catalogue-id pattern: ANYTHING that matches is treated as a
 * designation (M31, NGC 6946, IC 342, UGC 7772, C45, …) rather than
 * a "proper name".  Used by `pickProperName` to surface human-
 * readable names like "Andromeda Galaxy" on the featured-grid card
 * face when one is available.
 *
 * The pattern is deliberately liberal — extra prefixes (Arp, Mrk,
 * MCG, ESO, …) all read as catalog ids and are filtered out.  The
 * one false-positive risk is "M-named" galaxies whose proper name
 * happens to start with "M" too, but those don't exist in our seed.
 */
const DESIGNATION_RE =
  /^(M\s*\d+|C\s*\d+|NGC\s*\d+|IC\s*\d+|UGC\s*\d+|UGCA\s*\d+|PGC\s*\d+|MCG[\s-]?[+-]?\d|ESO\s*\d|Arp\s*\d|Mrk\s*\d)/i;

function pickProperName(names: readonly string[]): string {
  for (const n of names) {
    if (!DESIGNATION_RE.test(n.trim())) return n;
  }
  return names[0] ?? '?';
}

/**
 * Body content for an InfoTip that hovers a featured-grid card.
 * Surfaces the same flavour of context the InfoCard would show if
 * you actually selected the galaxy: morphological type, every
 * catalog designation it goes by, and the curated one-paragraph
 * description.  Lets users browse the grid by hovering rather than
 * having to commit a click to each card to read what it is.
 *
 * The "Also known as" line is the part the user explicitly asked
 * for: when the card face shows "Andromeda Galaxy", the tip body
 * reveals that's also M31, NGC 224, etc.
 */
type FeaturedCardTipProps = {
  names: readonly string[];
  description: string;
  type: string;
};
function FeaturedCardTip({ names, description, type }: FeaturedCardTipProps): ReactNode {
  return (
    <>
      {type && <div className={styles.tipType}>{type}</div>}
      {names.length > 1 && (
        <div className={styles.tipAliases}>
          <span className={styles.tipAliasesLabel}>Also known as </span>
          {names.join(' · ')}
        </div>
      )}
      {description && <div className={styles.tipDescription}>{description}</div>}
    </>
  );
}

/**
 * The maximum number of alias rows to include in the rendered list.
 * Generic substrings like `MCG` match thousands of rows; without a
 * cap the palette would render an unscrolled-but-scroll-stuttering
 * 5,000-row `<ul>` and the user would have to type more to see the
 * famous hits.
 */
const MAX_ALIAS_RESULTS = 50;

/**
 * Featured galaxies shown as a 5×3 thumbnail grid above the list when
 * the palette opens with no query.  Curated by name recognition: the
 * first row is "households know it" (Andromeda, Whirlpool, Sombrero,
 * the EHT-imaged M87, Centaurus A); the second is "every space-
 * interested person knows" (Cigar/Bode pair, Pinwheel, Triangulum,
 * Black Eye); the third is "amateur-astronomer favourites" (Southern
 * Pinwheel, Phantom, Cetus A's Seyfert, NGC 7331, Fireworks Galaxy).
 *
 * Order matters: the eye reads left-to-right, top-to-bottom, so the
 * most recognisable picks sit in the first row.  Edit this list to
 * change the lineup; the grid silently skips any id missing from the
 * loaded famous catalog so a misconfigured prod environment doesn't
 * crash the palette.
 */
const FEATURED_IDS: readonly string[] = [
  'm31',  // Andromeda
  'm51',  // Whirlpool
  'm104', // Sombrero
  'm87',  // EHT first-image
  'c77',  // Centaurus A (NGC 5128)
  'm82',  // Cigar
  'm81',  // Bode's
  'm101', // Pinwheel
  'm33',  // Triangulum
  'm64',  // Black Eye
  'm83',  // Southern Pinwheel
  'm74',  // Phantom (Webb 2022)
  'm77',  // Cetus A / Seyfert prototype
  'c45',  // NGC 7331 (Andromeda's twin)
  'c12',  // Fireworks Galaxy (NGC 6946)
];

/**
 * Famous-row tiebreak boost.  Added to every famous-row score so that
 * when a famous entry and an alias entry both score "name starts with
 * query", the famous one ranks higher.  Set just over the largest
 * possible length-bonus to avoid an alias's longer query bonus
 * leapfrogging a famous match — queries are realistically <16 chars,
 * so a +1 boost would be enough; we use +5 for safety.
 */
const FAMOUS_TIEBREAK = 5;

export type CommandPaletteProps = {
  /** All famous entries to search across.  Loaded from `famous_meta.json`. */
  entries: readonly FamousMetaEntry[];
  /**
   * The PGC alias index built by joining `pgc_aliases.json` against
   * the runtime GLADE+2MRS clouds.  Optional — the palette degrades
   * gracefully to famous-only when the array is undefined or empty
   * (e.g. on developer clones without the sidecar).
   */
  aliasIndex?: readonly AliasIndexEntry[];
  /** Whether the palette is currently shown. */
  open: boolean;
  /** Close handler — called on Esc, click-outside, or after a successful selection. */
  onClose: () => void;
  /** Selection handler for famous rows — receives the picked entry's id. */
  onSelect: (id: string) => void;
  /** Selection handler for alias rows — receives the picked entry's source + localIdx. */
  onSelectAlias?: (target: { source: Source; localIdx: number }) => void;
};

/**
 * One scored row, ready to render.  `kind` discriminates the two
 * payload shapes; the renderer branches on it to pick the right
 * onClick handler and the right primary/secondary text.
 */
type ScoredRow =
  | { kind: 'famous'; entry: FamousMetaEntry; score: number }
  | { kind: 'alias'; entry: AliasIndexEntry; score: number };

export function CommandPalette({
  entries,
  aliasIndex,
  open,
  onClose,
  onSelect,
  onSelectAlias,
}: CommandPaletteProps): ReactNode {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── Filter + rank entries by the current query ─────────────────────────────
  //
  // Empty query shows the full famous atlas in seed-file order so the user can
  // browse without typing — alias entries are NOT shown for empty queries
  // because there are 48k of them and rendering the full list every time the
  // palette opens would be a DOM-thrashing disaster.
  //
  // Non-empty query: score both indexes, sort, slice the alias list to a
  // reasonable cap, and concatenate (famous first because famous always
  // wins ties — see FAMOUS_TIEBREAK).
  const matches: ScoredRow[] = useMemo(() => {
    if (query.trim().length === 0) {
      return entries.map<ScoredRow>((e) => ({ kind: 'famous', entry: e, score: 0 }));
    }

    const famousScored: ScoredRow[] = entries
      .map<ScoredRow>((entry) => ({
        kind: 'famous',
        entry,
        score: scoreFamousMatch(entry, query) + (scoreFamousMatch(entry, query) > 0 ? FAMOUS_TIEBREAK : 0),
      }))
      .filter((s) => s.score > 0);
    famousScored.sort((a, b) => b.score - a.score);

    const aliasScored: ScoredRow[] = (aliasIndex ?? [])
      .map<ScoredRow>((entry) => ({
        kind: 'alias',
        entry,
        score: scoreAliasMatch(entry, query),
      }))
      .filter((s) => s.score > 0);
    aliasScored.sort((a, b) => b.score - a.score);
    const aliasCapped = aliasScored.slice(0, MAX_ALIAS_RESULTS);

    return [...famousScored, ...aliasCapped];
  }, [entries, aliasIndex, query]);

  // Reset highlight when the query changes — otherwise we'd point past the
  // end of a shrinking results list.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Focus the input when the palette opens.  The next tick is needed
  // because the input only enters the DOM in the same render that flips
  // `open` to true.
  useEffect(() => {
    if (open) {
      // requestAnimationFrame instead of useLayoutEffect because the
      // overlay's CSS transition would otherwise see the focused state
      // mid-fade.
      requestAnimationFrame(() => inputRef.current?.focus());
      setQuery('');
    }
  }, [open]);

  /**
   * Dispatch the selected row to the matching parent handler, then
   * close.  Centralised so the click and keyboard paths can't drift
   * apart silently.
   */
  const dispatchSelection = (m: ScoredRow): void => {
    if (m.kind === 'famous') {
      onSelect(m.entry.id);
    } else {
      onSelectAlias?.({ source: m.entry.source, localIdx: m.entry.localIdx });
    }
    onClose();
  };

  // ── Keyboard handling ──────────────────────────────────────────────────────
  //
  // Up/Down arrows navigate, Enter selects, Esc closes.  All other keys
  // pass through to the input so the user can type.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(matches.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches[activeIdx];
      if (m) dispatchSelection(m);
    }
  };

  // ── Featured grid (no-query state only) ────────────────────────────────────
  //
  // Resolve the FEATURED_IDS list against the loaded famous entries so the
  // grid renders real thumbnails + display names rather than ids.  Any id
  // missing from the catalog is dropped silently — the grid just gets a
  // little shorter.  Order is preserved so the curator's intent (most
  // recognisable first) survives the resolution.
  const featuredEntries: FamousMetaEntry[] = useMemo(() => {
    const byId = new Map(entries.map((e) => [e.id, e]));
    return FEATURED_IDS.flatMap((id) => {
      const e = byId.get(id);
      return e ? [e] : [];
    });
  }, [entries]);

  const showFeatured = query.trim().length === 0 && featuredEntries.length > 0;

  if (!open) return null;
  return (
    <div className={styles.backdrop} onClick={onClose} onKeyDown={onKeyDown} role="presentation">
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search galaxies"
      >
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Search galaxies (M31, NGC 4565, Andromeda, …)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {showFeatured && (
          <ul className={styles.featuredGrid} aria-label="Featured galaxies">
            {featuredEntries.map((entry) => {
              const properName = pickProperName(entry.names);
              return (
                <li key={`featured:${entry.id}`}>
                  <InfoTip
                    interactive
                    placement="bottom"
                    title={properName}
                    body={
                      <FeaturedCardTip
                        names={entry.names}
                        description={entry.description}
                        type={entry.type}
                      />
                    }
                  >
                    <button
                      type="button"
                      className={styles.featuredCard}
                      onClick={() => dispatchSelection({ kind: 'famous', entry, score: 0 })}
                      aria-label={`Focus ${properName}`}
                    >
                      <img
                        className={styles.featuredThumb}
                        src={`/images/famous/${entry.id}.webp`}
                        alt=""
                        loading="lazy"
                      />
                      <span className={styles.featuredName}>{properName}</span>
                    </button>
                  </InfoTip>
                </li>
              );
            })}
          </ul>
        )}
        {matches.length === 0 ? (
          <div className={styles.empty}>No matches</div>
        ) : (
          <ul className={styles.results}>
            {matches.map((m, i) => {
              const isActive = i === activeIdx;
              const className = `${styles.result} ${isActive ? styles.resultActive : ''}`;
              if (m.kind === 'famous') {
                return (
                  <li
                    key={`famous:${m.entry.id}`}
                    className={className}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => dispatchSelection(m)}
                  >
                    <img
                      className={styles.thumb}
                      src={`/images/famous/${m.entry.id}.webp`}
                      alt=""
                      loading="lazy"
                    />
                    <span>
                      <span className={styles.primary}>{m.entry.names[0]}</span>
                      {m.entry.names.length > 1 && (
                        <span className={styles.secondary}>
                          {m.entry.names.slice(1).join(' · ')}
                        </span>
                      )}
                    </span>
                  </li>
                );
              }
              // Alias row — distinct visual treatment: no thumbnail (we
              // don't pre-render NGC galaxies), small letter-glyph
              // placeholder + source-label chip on the secondary line so
              // the user can tell GLADE rows from 2MRS rows at a glance.
              const aliasEntry = m.entry;
              const primary = aliasEntry.names[0] ?? '(unnamed)';
              const remaining = aliasEntry.names.slice(1);
              return (
                <li
                  key={`alias:${aliasEntry.source}:${aliasEntry.localIdx}`}
                  className={className}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => dispatchSelection(m)}
                  data-testid={`alias-row-${aliasEntry.localIdx}`}
                >
                  <span className={styles.aliasGlyph} aria-hidden="true">
                    {primary[0] ?? '·'}
                  </span>
                  <span>
                    <span className={styles.primary}>{primary}</span>
                    {remaining.length > 0 && (
                      <span className={styles.secondary}>{remaining.join(' · ')}</span>
                    )}
                    <span className={styles.aliasSource}>{sourceLabel(aliasEntry.source)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
