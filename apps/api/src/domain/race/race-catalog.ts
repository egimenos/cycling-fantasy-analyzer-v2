import { RaceType } from '../shared/race-type.enum';
import { RaceClass } from '../shared/race-class.enum';

export interface RaceCatalogEntry {
  readonly slug: string;
  readonly name: string;
  readonly raceType: RaceType;
  readonly raceClass: RaceClass;
  readonly expectedStages?: number;
}

export const RACE_CATALOG: readonly RaceCatalogEntry[] = [
  // Grand Tours (21 stages each)
  {
    slug: 'tour-de-france',
    name: 'Tour de France',
    raceType: RaceType.GRAND_TOUR,
    raceClass: RaceClass.UWT,
    expectedStages: 21,
  },
  {
    slug: 'giro-d-italia',
    name: "Giro d'Italia",
    raceType: RaceType.GRAND_TOUR,
    raceClass: RaceClass.UWT,
    expectedStages: 21,
  },
  {
    slug: 'vuelta-a-espana',
    name: 'Vuelta a España',
    raceType: RaceType.GRAND_TOUR,
    raceClass: RaceClass.UWT,
    expectedStages: 21,
  },

  // Monument Classics
  {
    slug: 'milano-sanremo',
    name: 'Milano-Sanremo',
    raceType: RaceType.CLASSIC,
    raceClass: RaceClass.UWT,
  },
  {
    slug: 'ronde-van-vlaanderen',
    name: 'Tour of Flanders',
    raceType: RaceType.CLASSIC,
    raceClass: RaceClass.UWT,
  },
  {
    slug: 'paris-roubaix',
    name: 'Paris-Roubaix',
    raceType: RaceType.CLASSIC,
    raceClass: RaceClass.UWT,
  },
  {
    slug: 'liege-bastogne-liege',
    name: 'Liège-Bastogne-Liège',
    raceType: RaceType.CLASSIC,
    raceClass: RaceClass.UWT,
  },
  {
    slug: 'il-lombardia',
    name: 'Il Lombardia',
    raceType: RaceType.CLASSIC,
    raceClass: RaceClass.UWT,
  },

  // Other UWT Classics
  {
    slug: 'strade-bianche',
    name: 'Strade Bianche',
    raceType: RaceType.CLASSIC,
    raceClass: RaceClass.UWT,
  },
  {
    slug: 'amstel-gold-race',
    name: 'Amstel Gold Race',
    raceType: RaceType.CLASSIC,
    raceClass: RaceClass.UWT,
  },
  {
    slug: 'la-fleche-wallone',
    name: 'La Flèche Wallonne',
    raceType: RaceType.CLASSIC,
    raceClass: RaceClass.UWT,
  },
  {
    slug: 'san-sebastian',
    name: 'Clásica San Sebastián',
    raceType: RaceType.CLASSIC,
    raceClass: RaceClass.UWT,
  },

  // Mini Tours
  {
    slug: 'paris-nice',
    name: 'Paris-Nice',
    raceType: RaceType.MINI_TOUR,
    raceClass: RaceClass.UWT,
    expectedStages: 8,
  },
  {
    slug: 'tirreno-adriatico',
    name: 'Tirreno-Adriatico',
    raceType: RaceType.MINI_TOUR,
    raceClass: RaceClass.UWT,
    expectedStages: 7,
  },
  {
    slug: 'volta-a-catalunya',
    name: 'Volta a Catalunya',
    raceType: RaceType.MINI_TOUR,
    raceClass: RaceClass.UWT,
    expectedStages: 7,
  },
  {
    slug: 'criterium-du-dauphine',
    name: 'Critérium du Dauphiné',
    raceType: RaceType.MINI_TOUR,
    raceClass: RaceClass.UWT,
    expectedStages: 8,
  },
  {
    slug: 'tour-de-romandie',
    name: 'Tour de Romandie',
    raceType: RaceType.MINI_TOUR,
    raceClass: RaceClass.UWT,
    expectedStages: 6,
  },
  {
    slug: 'tour-de-suisse',
    name: 'Tour de Suisse',
    raceType: RaceType.MINI_TOUR,
    raceClass: RaceClass.UWT,
    expectedStages: 8,
  },
  {
    slug: 'itzulia-basque-country',
    name: 'Itzulia Basque Country',
    raceType: RaceType.MINI_TOUR,
    raceClass: RaceClass.UWT,
    expectedStages: 6,
  },
];

export function findRaceBySlug(slug: string): RaceCatalogEntry | undefined {
  return RACE_CATALOG.find((race) => race.slug === slug);
}

export function isKnownRace(slug: string): boolean {
  return RACE_CATALOG.some((race) => race.slug === slug);
}
