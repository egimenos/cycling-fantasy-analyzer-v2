export class EmptyPriceListError extends Error {
  constructor() {
    super('Zero valid riders after filtering');
    this.name = 'EmptyPriceListError';
  }
}

export class MlServiceUnavailableError extends Error {
  constructor() {
    super('ML service is unavailable. Please ensure the ML container is running and try again.');
    this.name = 'MlServiceUnavailableError';
  }
}

export class EmptyStartlistError extends Error {
  constructor(raceSlug: string, year: number) {
    super(
      `No startlist found for ${raceSlug}/${year}. ` +
        'Check the race URL — PCS may not have published the startlist yet.',
    );
    this.name = 'EmptyStartlistError';
  }
}

export class MlPredictionFailedError extends Error {
  constructor(raceSlug: string, year: number) {
    super(
      `ML prediction failed for ${raceSlug}/${year}. The ML service could not generate predictions for this race.`,
    );
    this.name = 'MlPredictionFailedError';
  }
}

export class RaceUrlParseError extends Error {
  constructor(url: string) {
    super(`Could not parse race URL: ${url}`);
    this.name = 'RaceUrlParseError';
  }
}

export class RaceProfileNotFoundError extends Error {
  constructor(raceSlug: string, year: number) {
    super(`Could not determine profile for ${raceSlug} ${year} or ${year - 1}`);
    this.name = 'RaceProfileNotFoundError';
  }
}

export class PriceListFetchError extends Error {
  constructor(url: string, statusCode: number) {
    super(`Failed to fetch price list from ${url} (HTTP ${statusCode})`);
    this.name = 'PriceListFetchError';
  }
}

export class EmptyPriceListPageError extends Error {
  constructor(url: string) {
    super(`No riders found on the page. Check the URL: ${url}`);
    this.name = 'EmptyPriceListPageError';
  }
}

export class AnalysisCancelledError extends Error {
  constructor() {
    super('Analysis cancelled by client');
    this.name = 'AnalysisCancelledError';
  }
}
