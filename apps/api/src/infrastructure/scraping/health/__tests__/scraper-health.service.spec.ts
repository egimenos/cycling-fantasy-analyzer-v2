import { ScraperHealthService } from './scraper-health.service';
import { HealthStatus } from '../../../domain/shared/health-status.enum';

function makeResultHtml(riderCount: number): string {
  const rows = Array.from(
    { length: riderCount },
    (_, i) =>
      `<tr><td>${i + 1}</td><td><a href="rider/rider-${i + 1}">Rider ${i + 1}</a></td><td>Team ${i + 1}</td></tr>`,
  ).join('');
  return `<html><body><div class="resTab"><table class="results">
    <thead><tr><th>Rnk</th><th>Rider</th><th>Team</th></tr></thead>
    <tbody>${rows}</tbody></table></div></body></html>`;
}

describe('ScraperHealthService', () => {
  let service: ScraperHealthService;
  const mockPcsClient = { fetchPage: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ScraperHealthService(mockPcsClient as never);
  });

  it('should start with HEALTHY status and null timestamps', () => {
    const health = service.getHealth();
    expect(health.overallStatus).toBe(HealthStatus.HEALTHY);
    expect(health.lastCheckAt).toBeNull();
    expect(health.parsers.stageRace.lastCheckAt).toBeNull();
    expect(health.parsers.classic.lastCheckAt).toBeNull();
  });

  it('should set HEALTHY when both parsers return valid results', async () => {
    mockPcsClient.fetchPage.mockResolvedValue(makeResultHtml(150));

    await service.checkHealth();

    const health = service.getHealth();
    expect(health.overallStatus).toBe(HealthStatus.HEALTHY);
    expect(health.parsers.stageRace.status).toBe(HealthStatus.HEALTHY);
    expect(health.parsers.classic.status).toBe(HealthStatus.HEALTHY);
    expect(health.lastCheckAt).toBeInstanceOf(Date);
  });

  it('should set DEGRADED when parser returns empty results', async () => {
    mockPcsClient.fetchPage.mockResolvedValue('<html><body></body></html>');

    await service.checkHealth();

    const health = service.getHealth();
    expect(health.overallStatus).toBe(HealthStatus.DEGRADED);
    expect(health.parsers.stageRace.status).toBe(HealthStatus.DEGRADED);
    expect(health.parsers.stageRace.sampleSize).toBe(0);
  });

  it('should set FAILING when fetch throws an error', async () => {
    mockPcsClient.fetchPage.mockRejectedValue(new Error('Cloudflare blocked'));

    await service.checkHealth();

    const health = service.getHealth();
    expect(health.overallStatus).toBe(HealthStatus.FAILING);
    expect(health.parsers.stageRace.status).toBe(HealthStatus.FAILING);
    expect(health.parsers.stageRace.lastError).toBe('Cloudflare blocked');
    expect(health.parsers.classic.status).toBe(HealthStatus.FAILING);
  });

  it('should compute DEGRADED if one parser is DEGRADED and other is HEALTHY', async () => {
    // Stage race returns results, classic returns empty
    mockPcsClient.fetchPage
      .mockResolvedValueOnce(makeResultHtml(150)) // stage race
      .mockResolvedValueOnce('<html><body></body></html>'); // classic

    await service.checkHealth();

    const health = service.getHealth();
    expect(health.parsers.stageRace.status).toBe(HealthStatus.HEALTHY);
    expect(health.parsers.classic.status).toBe(HealthStatus.DEGRADED);
    expect(health.overallStatus).toBe(HealthStatus.DEGRADED);
  });

  it('should compute FAILING if any parser is FAILING', async () => {
    mockPcsClient.fetchPage
      .mockResolvedValueOnce(makeResultHtml(150)) // stage race OK
      .mockRejectedValueOnce(new Error('Connection refused')); // classic fails

    await service.checkHealth();

    const health = service.getHealth();
    expect(health.parsers.stageRace.status).toBe(HealthStatus.HEALTHY);
    expect(health.parsers.classic.status).toBe(HealthStatus.FAILING);
    expect(health.overallStatus).toBe(HealthStatus.FAILING);
  });

  it('should record sample size from parsed results', async () => {
    mockPcsClient.fetchPage.mockResolvedValue(makeResultHtml(120));

    await service.checkHealth();

    const health = service.getHealth();
    expect(health.parsers.stageRace.sampleSize).toBe(120);
    expect(health.parsers.classic.sampleSize).toBe(120);
  });
});
