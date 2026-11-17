/**
 * produceMilkyWayLabel — the per-frame "You are here" label + stem, registered
 * on the COSMO slab's director via the Layer's `guides.screenLabels`.
 *
 * Core hands the label value (toggle, fade, clip and the `youAreHere` distance band, which
 * also keeps this producer from being called where the origin cannot project), so core
 * never learns a Milky-Way special case.
 */

import type { Label2D } from '../../../../@types/rendering/Label2D';
import type { LayerScreenLabel } from '../../../../@types/engine/layer/LayerScreenLabel';
import { milkyWayPickId } from '../../picking/present/milkyWayPickId';
import { MILKY_WAY_LABEL_STYLE } from './milkyWayLabelStyle';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { isPickableUnderFocus } from '../../../../utils/structure/isPickableUnderFocus';
import { MILKY_WAY_CENTER_WORLD } from '../../../../data/milkyWay/galacticCenter';

// The MW stellar disk, in kpc: the origin dot has no catalog row to read a
// diameter from, so the producer supplies one for the proportional lift.
const MILKY_WAY_DIAMETER_KPC = 30;

const LABEL_TEXT = 'You are here';

export const produceMilkyWayLabel =
  (pickCode: number): LayerScreenLabel<'milkyWay'>['produceLabels'] =>
  (state, ctx, fade) => {
    if (state.settings.labels.focusedOnly && state.selection.focus?.type !== 'milkyWay')
      return { labels: [], awake: false };

    const style = MILKY_WAY_LABEL_STYLE;
    const pickId = milkyWayPickId(pickCode);

    const labels: readonly Label2D[] = [
      {
        id: 'milkyWay',
        // Exactly what `milkyWayPickRenderer` stamps. The impostor picks on NEAR0
        // while this label picks on COSMO; both decode to `{ type: 'milkyWay' }`, so
        // both gate at the disc's centre.
        pickId: isPickableUnderFocus(MILKY_WAY_CENTER_WORLD, ctx.snapshot.focus)
          ? pickId
          : undefined,
        subjectId: pickId,
        worldPos: [0, 0, 0],
        text: LABEL_TEXT,
        font: 'cormorant',
        pixelSize: 0, // legacy field — ignored by the worldEm sizing model
        color: [...style.labelColor],
        worldEmMpc: style.worldEmMpc,
        minPixelSize: style.minPixelSize,
        maxPixelSize: style.maxPixelSize,
        fadeAlpha: fade,
        alignX: 'center',
        outlineColor: [...style.outlineColor],
        outlineEmFrac: style.outlineEmFrac,
        // The orientation anchor always wins the director's declutter. MAX_VALUE, not
        // Infinity: the comparator subtracts, and Infinity − Infinity is NaN, which
        // would corrupt the sort the moment a second always-wins label appeared.
        declutterPriority: Number.MAX_VALUE,
        // The label shader lifts the text off the origin dot and draws the stem.
        lift: {
          radiusMpc: (MILKY_WAY_DIAMETER_KPC / 2) * SCALE_UNITS.KPC_TO_MPC,
          leader: {
            widthPx: style.pixelWidth,
            color: [...style.lineColor],
            base: 'centre',
            gapPx: 0,
          },
        },
      },
    ];

    // Never `awake`: alpha is a pure function of camera distance, and camera motion
    // already wakes the loop. `awake: alpha < 1` would instead pin the loop for as
    // long as the camera parked inside the 0.6–2.0 Mpc band.
    return { labels, awake: false };
  };
