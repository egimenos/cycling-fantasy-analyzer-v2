import { BadRequestException } from '@nestjs/common';
import { assertAllowedHost } from '../assert-allowed-host';

describe('assertAllowedHost', () => {
  const allowed = ['procyclingstats.com'];

  it('accepts an exact allowed host', () => {
    const url = assertAllowedHost('https://procyclingstats.com/race/x/2024', allowed);
    expect(url.hostname).toBe('procyclingstats.com');
  });

  it('accepts subdomains of an allowed host', () => {
    const url = assertAllowedHost('https://www.procyclingstats.com/race/x/2024', allowed);
    expect(url.hostname).toBe('www.procyclingstats.com');
  });

  it('is case-insensitive on the hostname', () => {
    const url = assertAllowedHost('https://WWW.ProCyclingStats.com/race/x/2024', allowed);
    expect(url.hostname).toBe('www.procyclingstats.com');
  });

  it('rejects an empty or malformed URL', () => {
    expect(() => assertAllowedHost('', allowed)).toThrow(BadRequestException);
    expect(() => assertAllowedHost('not a url', allowed)).toThrow(BadRequestException);
    expect(() => assertAllowedHost('procyclingstats.com/race/x', allowed)).toThrow(
      BadRequestException,
    );
  });

  it('rejects non-http(s) protocols', () => {
    expect(() => assertAllowedHost('file:///etc/passwd', allowed)).toThrow(BadRequestException);
    expect(() => assertAllowedHost('ftp://procyclingstats.com/', allowed)).toThrow(
      BadRequestException,
    );
    expect(() => assertAllowedHost('javascript:alert(1)', allowed)).toThrow(BadRequestException);
  });

  it('rejects URLs with embedded credentials', () => {
    expect(() =>
      assertAllowedHost('https://procyclingstats.com@evil.com/race/x/2024', allowed),
    ).toThrow(BadRequestException);
    expect(() =>
      assertAllowedHost('https://user:pass@procyclingstats.com/race/x/2024', allowed),
    ).toThrow(BadRequestException);
  });

  it('rejects localhost and loopback addresses', () => {
    expect(() => assertAllowedHost('http://localhost/', allowed)).toThrow(BadRequestException);
    expect(() => assertAllowedHost('http://127.0.0.1/', allowed)).toThrow(BadRequestException);
    expect(() => assertAllowedHost('http://[::1]/', allowed)).toThrow(BadRequestException);
  });

  it('rejects private network and metadata IPs', () => {
    expect(() => assertAllowedHost('http://10.0.0.1/', allowed)).toThrow(BadRequestException);
    expect(() => assertAllowedHost('http://192.168.1.1/', allowed)).toThrow(BadRequestException);
    expect(() => assertAllowedHost('http://169.254.169.254/latest/meta-data/', allowed)).toThrow(
      BadRequestException,
    );
  });

  it('rejects the substring-check bypass payload from the SSRF report', () => {
    expect(() =>
      assertAllowedHost('http://169.254.169.254/?procyclingstats.com/race/x/2024', allowed),
    ).toThrow(BadRequestException);
  });

  it('rejects hosts that merely contain an allowed suffix as a substring', () => {
    expect(() => assertAllowedHost('https://evilprocyclingstats.com/race/x/2024', allowed)).toThrow(
      BadRequestException,
    );
    expect(() =>
      assertAllowedHost('https://procyclingstats.com.evil.com/race/x/2024', allowed),
    ).toThrow(BadRequestException);
  });

  it('supports multiple allow-list entries', () => {
    const multi = ['grandesminivueltas.com', 'procyclingstats.com'];
    expect(assertAllowedHost('https://grandesminivueltas.com/prices', multi).hostname).toBe(
      'grandesminivueltas.com',
    );
    expect(assertAllowedHost('https://www.procyclingstats.com/', multi).hostname).toBe(
      'www.procyclingstats.com',
    );
    expect(() => assertAllowedHost('https://example.com/', multi)).toThrow(BadRequestException);
  });
});
