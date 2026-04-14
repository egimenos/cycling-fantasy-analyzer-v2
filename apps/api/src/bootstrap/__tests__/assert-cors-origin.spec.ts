import { assertCorsOriginConfigured } from '../assert-cors-origin';

describe('assertCorsOriginConfigured', () => {
  it('returns the value when production and CORS_ORIGIN is set', () => {
    const result = assertCorsOriginConfigured({
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://app.example.com',
    });
    expect(result).toBe('https://app.example.com');
  });

  it('throws when production and CORS_ORIGIN is missing', () => {
    expect(() => assertCorsOriginConfigured({ NODE_ENV: 'production' })).toThrow(
      /CORS_ORIGIN must be set in production/,
    );
  });

  it('throws when production and CORS_ORIGIN is an empty string', () => {
    expect(() => assertCorsOriginConfigured({ NODE_ENV: 'production', CORS_ORIGIN: '' })).toThrow(
      /CORS_ORIGIN must be set in production/,
    );
  });

  it('throws when production and CORS_ORIGIN is only whitespace', () => {
    expect(() =>
      assertCorsOriginConfigured({ NODE_ENV: 'production', CORS_ORIGIN: '   ' }),
    ).toThrow(/CORS_ORIGIN must be set in production/);
  });

  it('returns undefined when NODE_ENV is development and CORS_ORIGIN is missing', () => {
    expect(assertCorsOriginConfigured({ NODE_ENV: 'development' })).toBeUndefined();
  });

  it('returns undefined when NODE_ENV is test and CORS_ORIGIN is missing', () => {
    expect(assertCorsOriginConfigured({ NODE_ENV: 'test' })).toBeUndefined();
  });

  it('returns the value when NODE_ENV is development and CORS_ORIGIN is set', () => {
    const result = assertCorsOriginConfigured({
      NODE_ENV: 'development',
      CORS_ORIGIN: 'http://localhost:3000',
    });
    expect(result).toBe('http://localhost:3000');
  });

  it('returns undefined when NODE_ENV is unset and CORS_ORIGIN is missing', () => {
    expect(assertCorsOriginConfigured({})).toBeUndefined();
  });
});
