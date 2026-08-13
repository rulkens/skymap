// @vitest-environment jsdom
//
// InfoCard — Zone of Avoidance routing tests. A zoneOfAvoidance selection
// renders the ZoA detail card (headline + description); unlike every other
// FocusableTarget arm, it never wires a Focus/Fly-here affordance, since the
// band has no x/y/z to fly to (see ZoneOfAvoidanceInfo's doc comment). That's
// the one behavior worth a regression test — a future edit re-adding `onFocus`
// without a real position would silently produce a dead button.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import InfoCard from '../../../src/components/InfoCard/InfoCard';
import { ZONE_OF_AVOIDANCE_INFO } from '../../../src/data/zoneOfAvoidance/zoneOfAvoidanceInfo';

describe('InfoCard Zone of Avoidance', () => {
  it('renders the Zone of Avoidance card for a zoneOfAvoidance selection', () => {
    render(createElement(InfoCard, { hovered: null, selected: ZONE_OF_AVOIDANCE_INFO }));
    expect(screen.getByText(ZONE_OF_AVOIDANCE_INFO.displayName)).toBeInTheDocument();
    expect(screen.getByText(ZONE_OF_AVOIDANCE_INFO.description)).toBeInTheDocument();
  });

  it('the Zone of Avoidance card renders no Focus/Fly-here affordance', () => {
    render(
      createElement(InfoCard, {
        hovered: null,
        selected: ZONE_OF_AVOIDANCE_INFO,
        onFocus: () => {},
      }),
    );
    expect(screen.queryByText('Focus')).toBeNull();
  });
});
