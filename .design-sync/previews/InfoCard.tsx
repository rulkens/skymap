/**
 * InfoCard preview cells — one per dataset variant the card can show. InfoCard
 * is skymap's HUD overlay: its root is `position: fixed` (top-right corner), so
 * each cell wraps it in a `Frame` whose `transform` establishes a containing
 * block, re-anchoring the fixed card inside the cell over a dark backdrop (the
 * panels are translucent glass and need a dark scene behind them to read).
 *
 * `hovered` must be passed explicitly (InfoCard's guard is `hovered !== null`,
 * so an omitted `undefined` slips through into `targetEq`). The HoverPair cell
 * fills `hovered` to show the compact hover-preview card stacked beneath.
 */
import type { ReactNode } from 'react';
import { InfoCard } from 'skymap';
// Fixtures bundle straight into the preview (a namespace export through the
// bundle's global shim comes back undefined); importing the source directly is
// robust and keeps InfoCard itself sourced from the shipped bundle.
import * as fixtures from '../entry/fixtures';
import type { FocusableTarget } from '../../src/@types/engine/FocusableTarget';

function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      className="ds-preview-frame"
      style={{
        position: 'relative',
        transform: 'translateZ(0)',
        width: 380,
        minHeight: 470,
        background: 'radial-gradient(120% 120% at 70% 20%, #0b1022 0%, #04060d 70%)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

const noop = () => {};

/** One pinned card for a single target. */
function card(target: FocusableTarget, memberCount?: number) {
  return (
    <Frame>
      <InfoCard
        selected={target}
        hovered={null}
        selectedMemberCount={memberCount}
        onFocus={noop}
        onClose={noop}
      />
    </Frame>
  );
}

// ── Galaxy catalog variants ─────────────────────────────────────────────────
export const SdssGalaxy = () => card(fixtures.sdssGalaxy);
export const TwoMrsGalaxy = () => card(fixtures.twoMrsGalaxy);
export const GladeGalaxy = () => card(fixtures.gladeGalaxy);
export const FamousGalaxy = () => card(fixtures.famousGalaxy);
export const MilliquasAGN = () => card(fixtures.milliquasAgn);
export const DesiTracer = () => card(fixtures.desiTracer);

// ── Extended structures ─────────────────────────────────────────────────────
export const Cluster = () => card(fixtures.cluster, 1274);
export const Supercluster = () => card(fixtures.supercluster);
export const Void = () => card(fixtures.cosmicVoid);
export const Group = () => card(fixtures.group);

// ── Singleton + bodies + field star ─────────────────────────────────────────
export const MilkyWay = () => card(fixtures.milkyWay);
export const Sun = () => card(fixtures.sun);
export const FamousStar = () => card(fixtures.famousStar);
export const Planet = () => card(fixtures.planet);
export const Moon = () => card(fixtures.moon);
export const FieldStar = () => card(fixtures.fieldStar);

// ── Hover + pinned pair (compact preview stacked under the pinned detail) ────
export const HoverPair = () => (
  <Frame>
    <InfoCard
      selected={fixtures.famousGalaxy}
      hovered={fixtures.cluster}
      selectedMemberCount={1274}
      onFocus={noop}
      onClose={noop}
    />
  </Frame>
);
