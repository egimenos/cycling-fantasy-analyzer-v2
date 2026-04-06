/**
 * Maps PCS race slugs to alternative search terms for GMV fuzzy matching.
 * Only needed for races where the PCS slug language differs from the GMV post title language.
 */
export const RACE_NAME_ALIASES: Record<string, string[]> = {
  'amstel-gold-race': ['Amstel Gold Race'],
  'brabantse-pijl': ['Flecha Brabanzona'],
  'cyclassics-hamburg': ['BEMER Cyclassics', 'Cyclassics'],
  'e3-harelbeke': ['E3 Saxo Classic', 'E3 Harelbeke Saxo Classic'],
  'e3-saxo-classic': ['E3 Harelbeke', 'E3 Harelbeke Saxo Classic'],
  'gent-wevelgem': ['Gante-Wevelgem', 'Gante Wevelgem'],
  'giro-d-italia': ['Giro de Italia'],
  'il-lombardia': ['Lombardia', 'Il Lombardia'],
  'kuurne-brussel-kuurne': ['Kuurne Bruselas Kuurne'],
  'la-fleche-wallonne': ['Flecha Valona', 'Fleche Wallonne'],
  'liege-bastogne-liege': ['Lieja-Bastoña-Lieja', 'Lieja Bastona Lieja'],
  'milano-sanremo': ['Milano Sanremo', 'Milan-San Remo', 'Milan San Remo'],
  'omloop-het-nieuwsblad': ['Omloop Het Nieuwsblad'],
  'paris-nice': ['Paris-Niza', 'París-Niza'],
  'paris-roubaix': ['Paris-Roubaix', 'Paris Roubaix'],
  'ronde-van-vlaanderen': ['Tour de Flandes', 'Flandes'],
  'tour-de-france': ['Tour de Francia'],
  'tour-de-pologne': ['Tour de Polonia'],
  'tour-de-romandie': ['Tour de Romandia', 'Tour de Romandía'],
  'tour-de-suisse': ['Tour de Suiza', 'Vuelta a Suiza'],
  'tour-of-the-alps': ['Tour de los Alpes'],
  'vuelta-a-espana': ['La Vuelta', 'Vuelta a España'],
  'world-championship': [
    'Mundial Ruta Masculina',
    'Mundial Masculino',
    'Campeonatos del Mundo Ruta',
  ],
};

export function getSearchTerms(raceSlug: string, raceName: string): string[] {
  const aliases = RACE_NAME_ALIASES[raceSlug] ?? [];
  return [raceName, ...aliases];
}
