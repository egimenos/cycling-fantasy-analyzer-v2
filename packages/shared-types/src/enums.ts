export enum RaceType {
  GRAND_TOUR = 'grand_tour',
  CLASSIC = 'classic',
  MINI_TOUR = 'mini_tour',
}

export enum RaceClass {
  UWT = 'UWT',
  PRO = 'Pro',
  ONE = '1',
}

export enum ResultCategory {
  GC = 'gc',
  STAGE = 'stage',
  MOUNTAIN = 'mountain',
  SPRINT = 'sprint',
}

export enum ScrapeStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  FAILING = 'failing',
}
