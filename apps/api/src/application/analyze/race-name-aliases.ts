/**
 * Maps PCS race slugs to alternative search terms for GMV fuzzy matching.
 * Only needed for races where the PCS slug language differs from the GMV post title language.
 */
export const RACE_NAME_ALIASES: Record<string, string[]> = {
  'amstel-gold-race': ['Amstel Gold Race'],
  'giro-d-italia': ['Giro de Italia'],
  'il-lombardia': ['Lombardia', 'Il Lombardia'],
  'la-fleche-wallonne': ['Flecha Valona', 'Fleche Wallonne'],
  'liege-bastogne-liege': ['Lieja-Bastoña-Lieja', 'Lieja Bastona Lieja'],
  'milano-sanremo': ['Milan-San Remo', 'Milan San Remo'],
  'paris-roubaix': ['Paris-Roubaix', 'Paris Roubaix'],
  'ronde-van-vlaanderen': ['Tour de Flandes', 'Flandes'],
  'tour-de-france': ['Tour de Francia'],
  'vuelta-a-espana': ['La Vuelta', 'Vuelta a España'],
};

export function getSearchTerms(raceSlug: string, raceName: string): string[] {
  const aliases = RACE_NAME_ALIASES[raceSlug] ?? [];
  return [raceName, ...aliases];
}
