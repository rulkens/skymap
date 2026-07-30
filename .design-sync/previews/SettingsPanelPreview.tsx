/**
 * SettingsPanelPreview cells — the full renderer settings HUD, wired with local
 * state so toggles / sliders / dropdowns move. Rendered over a dark backdrop
 * (the panel is translucent glass) inside a containing-block frame so its fixed
 * chrome anchors to the cell rather than the viewport.
 *
 * Open shows the panel expanded (all sections foldable inside); Collapsed shows
 * the default collapsed header strip with the tier chip.
 */
import type { ReactNode } from 'react';
import { SettingsPanelPreview } from 'skymap';

function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      className="ds-preview-frame"
      style={{
        position: 'relative',
        transform: 'translateZ(0)',
        width: 380,
        minHeight: 620,
        background: 'radial-gradient(120% 120% at 30% 10%, #0b1022 0%, #04060d 70%)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

export const Open = () => (
  <Frame>
    <SettingsPanelPreview defaultOpen />
  </Frame>
);

export const Collapsed = () => (
  <Frame>
    <SettingsPanelPreview defaultOpen={false} />
  </Frame>
);
