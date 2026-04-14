// Fails loudly at boot if CORS_ORIGIN is missing in production. The fallback
// to localhost is intentional for dev ergonomics, but in prod a missing value
// means the frontend will silently break — we'd rather crash the container
// with a clear error than ship a useless CORS policy and get a bug report
// hours later.
export function assertCorsOriginConfigured(env: NodeJS.ProcessEnv): string | undefined {
  const corsOrigin = env.CORS_ORIGIN?.trim();
  if (env.NODE_ENV === 'production' && !corsOrigin) {
    throw new Error(
      'CORS_ORIGIN must be set in production. Configure it in Dokploy environment variables.',
    );
  }
  return corsOrigin || undefined;
}
