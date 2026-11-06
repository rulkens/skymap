import type { LayerSwitch } from '../../../../src/@types/url/LayerSwitch';
import type { SiteShotSettings } from '../@types/SiteShotSettings';

type Address = LayerSwitch['address'];
const on = (address: Address): LayerSwitch => ({ address, on: true });
const off = (address: Address): LayerSwitch => ({ address, on: false });

/**
 * The `layers=` switches a shot's settings stand for, in the order the runner used to dispatch them (hides
 * first, then switch-ons), so the link and the picture are one address. A galaxy shot keeps the photographs
 * (`famousGalaxy`), which a bare `-survey` would hide with the rest.
 */
export function shotLayerSwitches(settings: SiteShotSettings): readonly LayerSwitch[] {
  const switches: LayerSwitch[] = [];
  if (settings.hideOrbitTrails) switches.push(off('orbitTrails'));
  if (settings.hideStructures) switches.push(off('structureRing'));
  if (settings.hideStructureLabels) switches.push(off('label:structure'));
  if (settings.hideGalaxyField) switches.push(off('survey'), on('survey:famousGalaxy'));
  if (settings.hideStars) switches.push(off('starCatalog'));
  if (settings.hideCosmicWeb) switches.push(off('cosmicWebDensity'));
  if (settings.hideZoneOfAvoidance) switches.push(off('zoneOfAvoidance'));
  if (settings.filaments) switches.push(on('cosmicWebFilaments'));
  if (settings.constellations) switches.push(on('constellations'));
  if (settings.missionTrails) switches.push(on('missionTrails'));
  if (settings.flow) switches.push(on('flow'));
  if (settings.desiWedge) switches.push(on('survey:desiWedge'));
  if (settings.hideLabels) {
    switches.push(
      off('label:famousGalaxy'),
      off('label:starCatalog'),
      off('label:structure'),
      off('label:milkyWay'),
      off('label:blackHole:sgr-a-star'),
    );
    // The planets', moons' and spacecraft's names are the subject of a body shot.
    if (!settings.keepBodyLabels) switches.push(off('label:body'), off('label:missions'));
  }
  return switches;
}
