/**
 * GalaxyList — left-panel scrollable list.  Each row shows the
 * galaxy's primary display name + a curated-done indicator.  Click to
 * select.
 *
 * Why semantic HTML attributes instead of class-based state?
 * Plan D (styling) hooks into `data-curated` and `aria-current` for
 * CSS selectors rather than requiring style-aware logic here.  This
 * keeps the component purely functional — it maps data to markup and
 * delegates all visual decisions to the stylesheet.
 *
 * The `aria-current` attribute follows WAI-ARIA 1.1: a value of "true"
 * marks the currently selected item in a list.  Assistive technologies
 * announce it as "current" to screen-reader users.
 */
import { useMemo, useState } from 'react';
import type { GalaxyListEntry } from '../api';

export type GalaxyListProps = {
  galaxies: ReadonlyArray<GalaxyListEntry>;
  activeId: string | undefined;
  onSelect: (id: string) => void;
};

export function GalaxyList(props: GalaxyListProps) {
  // Local search state — doesn't need to live in App's reducer since it's
  // pure UI filtering (no side-effects on selection or API calls).
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return props.galaxies;
    // Match against any of the galaxy's names (common, NGC, Messier, etc).
    // Substring + case-insensitive — no fancy fuzzy match needed for a
    // 75-entry list.
    return props.galaxies.filter((g) => g.names.some((n) => n.toLowerCase().includes(q)));
  }, [props.galaxies, query]);
  return (
    <div className="curator-galaxy-list-wrap">
      <input
        className="curator-galaxy-list__search"
        type="search"
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search galaxies"
      />
      <ul className="curator-galaxy-list" role="list">
        {filtered.map((g) => {
          // Fall back to raw id if names array is empty — should never happen
          // with valid API data, but guards against malformed seeds.
          const allNames = g.names.length > 0 ? g.names : [g.id];
          const [primary, ...aliases] = allNames;
          const isActive = g.id === props.activeId;
          return (
            <li
              key={g.id}
              data-galaxy-id={g.id}
              data-curated={String(g.curated)}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => props.onSelect(g.id)}
            >
              <span className="curator-galaxy-list__name">
                {primary}
                {aliases.map((n) => (
                  // Middle dot (·) separator — same glyph used elsewhere for
                  // attribution chips.  Render each alias in its own muted
                  // span so CSS can style the divider + text uniformly.
                  <span key={n} className="curator-galaxy-list__alias">
                    {' · '}
                    {n}
                  </span>
                ))}
              </span>
              {g.hasDisk &&
                // Tilted ellipse glyph standing in for a disk seen at an angle —
                // a quick at-a-glance marker that this galaxy's disk geometry is
                // calibrated.  Sits before the curated check so the two badges
                // read left-to-right in pipeline order (disk set, then exported).
                // Title distinguishes a deprojected (face-on corrected) disk from
                // a flat one so the curator can tell the two states apart on hover.
                (() => {
                  const label = g.diskDeproject
                    ? 'Has calibrated disk (deprojected)'
                    : 'Has calibrated disk (flat)';
                  return (
                    <span
                      className="curator-galaxy-list__disk"
                      title={label}
                      aria-label={label}
                      data-testid="disk-indicator"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                        <ellipse
                          cx="6"
                          cy="6"
                          rx="5"
                          ry="2.5"
                          transform="rotate(-30 6 6)"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                      </svg>
                    </span>
                  );
                })()}
              {g.curated && (
                <span className="curator-galaxy-list__check" aria-label="curated">
                  ✓
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
