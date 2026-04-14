import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AnalyzeController } from '../analyze.controller';
import {
  AnalyzePriceListUseCase,
  AnalyzeResponse,
} from '../../application/analyze/analyze-price-list.use-case';
import { ImportPriceListUseCase } from '../../application/analyze/import-price-list.use-case';

describe('AnalyzeController', () => {
  let controller: AnalyzeController;
  let mockUseCase: jest.Mocked<Pick<AnalyzePriceListUseCase, 'execute'>>;
  let mockImportUseCase: jest.Mocked<Pick<ImportPriceListUseCase, 'execute'>>;

  const sampleResponse: AnalyzeResponse = {
    riders: [
      {
        rawName: 'POGACAR Tadej',
        rawTeam: 'UAE',
        priceHillios: 300,
        matchedRider: {
          id: 'r1',
          pcsSlug: 'pogacar-tadej',
          fullName: 'Pogacar Tadej',
          currentTeam: 'UAE Team Emirates',
          avatarUrl: null,
          nationality: 'SI',
        },
        matchConfidence: 0.95,
        unmatched: false,
        pointsPerHillio: 0.67,
        totalProjectedPts: 200,
        categoryScores: { gc: 150, stage: 30, mountain: 10, sprint: 10 },
        breakout: null,
        sameRaceHistory: null,
        seasonBreakdowns: null,
      },
    ],
    totalSubmitted: 1,
    totalMatched: 1,
    unmatchedCount: 0,
  };

  beforeEach(async () => {
    mockUseCase = {
      execute: jest.fn().mockResolvedValue(sampleResponse),
    };
    mockImportUseCase = {
      execute: jest.fn().mockResolvedValue({ riders: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyzeController],
      providers: [
        { provide: AnalyzePriceListUseCase, useValue: mockUseCase },
        { provide: ImportPriceListUseCase, useValue: mockImportUseCase },
      ],
    }).compile();

    controller = module.get<AnalyzeController>(AnalyzeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call use case with correct input and stream SSE response', async () => {
    const dto = {
      riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
      raceType: 'grand_tour' as const,
      budget: 2000,
    };

    const mockReq = { on: jest.fn() } as unknown as import('express').Request;
    const written: string[] = [];
    const mockRes = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => written.push(chunk)),
      end: jest.fn(),
    } as unknown as import('express').Response;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO doesn't need full class instance
    await controller.analyze(dto as any, mockReq, mockRes);

    expect(mockUseCase.execute).toHaveBeenCalledWith(
      {
        riders: dto.riders,
        raceType: dto.raceType,
        budget: dto.budget,
        profileSummary: undefined,
        raceSlug: undefined,
        year: undefined,
      },
      expect.any(Object),
    );
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(mockRes.end).toHaveBeenCalled();
    // The result event should have been written to the stream
    const resultEvent = written.find((w) => w.startsWith('event: result'));
    expect(resultEvent).toBeDefined();
  });

  describe('importPriceList', () => {
    it('accepts the GMV price list URL', async () => {
      await controller.importPriceList('https://grandesminivueltas.com/precios/2026');
      expect(mockImportUseCase.execute).toHaveBeenCalledWith(
        'https://grandesminivueltas.com/precios/2026',
      );
    });

    it('accepts GMV subdomains', async () => {
      await controller.importPriceList('https://www.grandesminivueltas.com/precios/2026');
      expect(mockImportUseCase.execute).toHaveBeenCalled();
    });

    it('rejects a missing URL', async () => {
      await expect(controller.importPriceList('')).rejects.toThrow(BadRequestException);
      expect(mockImportUseCase.execute).not.toHaveBeenCalled();
    });

    it.each([
      ['localhost', 'http://localhost/precios'],
      ['loopback', 'http://127.0.0.1/precios'],
      ['private network', 'http://10.0.0.1/precios'],
      ['Docker service', 'http://postgres:5432/'],
      ['metadata IP', 'http://169.254.169.254/latest/meta-data/'],
      [
        'metadata IP with grandesminivueltas substring bypass',
        'http://169.254.169.254/?grandesminivueltas.com/precios',
      ],
      ['credentials bypass', 'https://grandesminivueltas.com@evil.com/precios'],
      ['wrong protocol', 'file:///etc/passwd'],
      ['unrelated host', 'https://evil.com/precios'],
      ['look-alike host', 'https://evilgrandesminivueltas.com/precios'],
    ])('rejects SSRF payload (%s)', async (_label, url) => {
      await expect(controller.importPriceList(url)).rejects.toThrow(BadRequestException);
      expect(mockImportUseCase.execute).not.toHaveBeenCalled();
    });
  });
});
