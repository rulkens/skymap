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
import type { GalaxyListEntry } from '../api';

export type GalaxyListProps = {
  galaxies: ReadonlyArray<GalaxyListEntry>;
  activeId: string | undefined;
  onSelect: (id: string) => void;
};

export function GalaxyList(props: GalaxyListProps) {
  return (
    <ul className="curator-galaxy-list" role="list">
      {props.galaxies.map((g) => {
        // Fall back to raw id if names array is empty — should never happen
        // with valid API data, but guards against malformed seeds.
        const primary = g.names[0] ?? g.id;
        const isActive = g.id === props.activeId;
        return (
          <li
            key={g.id}
            data-galaxy-id={g.id}
            data-curated={String(g.curated)}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => props.onSelect(g.id)}
          >
            <span className="curator-galaxy-list__name">{primary}</span>
            {g.curated && (
              <span className="curator-galaxy-list__check" aria-label="curated">
                ✓
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
