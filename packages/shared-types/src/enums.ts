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
  GC_DAILY = 'gc_daily',
  MOUNTAIN_PASS = 'mountain_pass',
  SPRINT_INTERMEDIATE = 'sprint_intermediate',
  REGULARIDAD_DAILY = 'regularidad_daily',
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

export enum ParcoursType {
  P1 = 'p1', // Flat
  P2 = 'p2', // Hills, flat finish
  P3 = 'p3', // Hills, uphill finish
  P4 = 'p4', // Mountains, flat finish
  P5 = 'p5', // Mountains, uphill finish
}
