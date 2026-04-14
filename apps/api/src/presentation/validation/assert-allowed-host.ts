import { BadRequestException } from '@nestjs/common';

export function assertAllowedHost(rawUrl: string, allowedSuffixes: string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException('Only http(s) URLs are allowed');
  }

  // Reject credentials in the authority — blocks bypasses like https://allowed.com@evil.com
  if (parsed.username !== '' || parsed.password !== '') {
    throw new BadRequestException('URL must not contain credentials');
  }

  const host = parsed.hostname.toLowerCase();
  const allowed = allowedSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (!allowed) {
    throw new BadRequestException(`Host ${host} is not allowed`);
  }

  return parsed;
}
