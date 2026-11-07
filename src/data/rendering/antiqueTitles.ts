/**
 * ANTIQUE_TITLES — each plate's cartouche title, top to bottom: a group's style
 * and the ways its text may break (`fitAntiqueTitle` keeps the break that lets
 * the block grow largest). Wording follows the period's own plates: Blaeu's and
 * Hondius' "nova … descriptio", Visscher's Holland and Seventeen Provinces, Hevelius' and Doppelmayr's
 * Moon, Huygens' Systema Saturnium (1659); Mars from Huygens' and Cassini's sketches.
 */

import type { AntiqueTitleGroup } from '../../@types/rendering/AntiqueTitleGroup';
import type { AntiqueTitleKey } from '../../@types/rendering/AntiqueTitleKey';

const head = (text: string): AntiqueTitleGroup => ({
  style: { face: 'roman', cap: 1, tracking: 0.14, minSqueeze: 0.85 },
  breaks: [[text]],
});
const title = (...breaks: (readonly string[])[]): AntiqueTitleGroup => ({
  style: { face: 'roman', cap: 1.6, tracking: 0, minSqueeze: 0.72 },
  breaks,
});
const sub = (...breaks: (readonly string[])[]): AntiqueTitleGroup => ({
  style: { face: 'italic', cap: 0.85, tracking: 0, minSqueeze: 0.85 },
  breaks,
});
const small = (...breaks: (readonly string[])[]): AntiqueTitleGroup => ({
  style: { face: 'italic', cap: 0.7, tracking: 0, minSqueeze: 0.85 },
  breaks,
});

const IMPRINT = [
  ['Amstelodami, ex officina Skymapiana, Anno MDCXC'],
  ['Amstelodami, ex officina Skymapiana,', 'Anno MDCXC'],
] as const;
const PRIVILEGE = small(
  ['Cum Privilegio Ordinum Hollandiae et Westfrisiae'],
  ['Cum Privilegio Ordinum', 'Hollandiae et Westfrisiae'],
);
/** A map of the Earth: a short head, the name, the imprint and the States' privilege. */
const terrestrial = (lead: string, ...name: (readonly string[])[]) => [
  head(lead),
  title(...name),
  sub(...IMPRINT),
  PRIVILEGE,
];

export const ANTIQUE_TITLES: Readonly<Record<AntiqueTitleKey, readonly AntiqueTitleGroup[]>> = {
  universe: [
    head('NOVA ET ACCVRATISSIMA'),
    title(['TOTIVS VNIVERSI TABVLA'], ['TOTIVS VNIVERSI', 'TABVLA']),
    sub(...IMPRINT),
    PRIVILEGE,
  ],
  coelum: [
    head('NOVA ET ACCVRATISSIMA'),
    title(['COELI STELLATI TABVLA'], ['COELI STELLATI', 'TABVLA']),
    sub(['Stellarum fixarum Loca ad Annum MDCXC'], ['Stellarum fixarum Loca', 'ad Annum MDCXC']),
    small(...IMPRINT),
  ],
  orbis: terrestrial('NOVA', ['TOTIVS TERRARVM ORBIS TABVLA'], ['TOTIVS TERRARVM', 'ORBIS TABVLA']),
  europa: terrestrial('NOVA', ['EVROPÆ DESCRIPTIO'], ['EVROPÆ', 'DESCRIPTIO']),
  asia: terrestrial('NOVA', ['ASIÆ DESCRIPTIO'], ['ASIÆ', 'DESCRIPTIO']),
  africa: terrestrial('NOVA', ['AFRICÆ DESCRIPTIO'], ['AFRICÆ', 'DESCRIPTIO']),
  americaSeptentrionalis: terrestrial(
    'NOVA',
    ['AMERICA SEPTENTRIONALIS'],
    ['AMERICA', 'SEPTENTRIONALIS'],
  ),
  americaMeridionalis: terrestrial('NOVA', ['AMERICA MERIDIONALIS'], ['AMERICA', 'MERIDIONALIS']),
  belgium: terrestrial(
    'NOVISSIMA ET ACCVRATISSIMA',
    ['XVII PROVINCIARVM GERMANIÆ INFERIORIS TABVLA'],
    ['XVII PROVINCIARVM', 'GERMANIÆ INFERIORIS TABVLA'],
    ['XVII PROVINCIARVM', 'GERMANIÆ INFERIORIS', 'TABVLA'],
  ),
  hollandia: terrestrial('NOVA ET ACCVRATA', ['COMITATVS HOLLANDIÆ'], ['COMITATVS', 'HOLLANDIÆ']),
  luna: [
    head('NOVA ET ACCVRATISSIMA'),
    title(['TABVLA SELENOGRAPHICA'], ['TABVLA', 'SELENOGRAPHICA']),
    sub(
      ['in qua Lunarium Macularum exacta Descriptio'],
      ['in qua Lunarium Macularum', 'exacta Descriptio'],
    ),
    small(...IMPRINT),
  ],
  mars: [
    head('NOVA ET ACCVRATA'),
    title(['MARTIS FACIES'], ['MARTIS', 'FACIES']),
    sub(['ex Observationibus Hugenii et Cassini'], ['ex Observationibus', 'Hugenii et Cassini']),
    small(...IMPRINT),
  ],
  iupiter: [
    head('NOVA ET ACCVRATA'),
    title(['IOVIS FACIES'], ['IOVIS', 'FACIES']),
    sub(['cum Sideribus Mediceis']),
    small(...IMPRINT),
  ],
  saturnus: [
    head('CHRISTIANI HVGENII'),
    title(['SYSTEMA SATVRNIVM'], ['SYSTEMA', 'SATVRNIVM']),
    sub(
      ['sive de Causis mirandorum Saturni Phænomenôn'],
      ['sive de Causis mirandorum', 'Saturni Phænomenôn'],
    ),
    small(...IMPRINT),
  ],
};
