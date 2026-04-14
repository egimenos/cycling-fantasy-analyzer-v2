// Centralized override limits for expensive routes. The global default
// (60/min) lives in AppModule; these are per-route tightenings.
export const THROTTLE_ANALYZE = { default: { limit: 5, ttl: 60_000 } } as const;
export const THROTTLE_EXTERNAL_SCRAPE = { default: { limit: 15, ttl: 60_000 } } as const;
