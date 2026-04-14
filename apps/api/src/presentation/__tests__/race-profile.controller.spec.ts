import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RaceProfileController } from '../race-profile.controller';
import { FetchRaceProfileUseCase } from '../../application/analyze/fetch-race-profile.use-case';
import { RaceType } from '../../domain/shared/race-type.enum';
import type { RaceProfileResponse } from '@cycling-analyzer/shared-types';

describe('RaceProfileController', () => {
  let controller: RaceProfileController;
  let mockUseCase: jest.Mocked<Pick<FetchRaceProfileUseCase, 'execute'>>;

  const sampleResponse: RaceProfileResponse = {
    raceSlug: 'tour-de-france',
    raceName: 'Tour De France',
    raceType: RaceType.GRAND_TOUR,
    year: 2025,
    totalStages: 2,
    stages: [
      {
        stageNumber: 1,
        parcoursType: 'p1' as never,
        isItt: false,
        isTtt: false,
        distanceKm: 195,
        departure: 'Brussels',
        arrival: 'Charleroi',
      },
      {
        stageNumber: 2,
        parcoursType: 'p5' as never,
        isItt: false,
        isTtt: false,
        distanceKm: 170,
        departure: 'Pau',
        arrival: 'Col du Tourmalet',
      },
    ],
    profileSummary: {
      p1Count: 1,
      p2Count: 0,
      p3Count: 0,
      p4Count: 0,
      p5Count: 1,
      ittCount: 0,
      tttCount: 0,
      unknownCount: 0,
    },
  };

  beforeEach(async () => {
    mockUseCase = {
      execute: jest.fn().mockResolvedValue(sampleResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RaceProfileController],
      providers: [{ provide: FetchRaceProfileUseCase, useValue: mockUseCase }],
    }).compile();

    controller = module.get<RaceProfileController>(RaceProfileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return profile data for a valid PCS URL', async () => {
    const url = 'https://www.procyclingstats.com/race/tour-de-france/2025';
    const result = await controller.getRaceProfile(url);

    expect(mockUseCase.execute).toHaveBeenCalledWith(url);
    expect(result).toEqual(sampleResponse);
  });

  it('should throw BadRequestException for missing URL', async () => {
    await expect(controller.getRaceProfile('')).rejects.toThrow(BadRequestException);
    expect(mockUseCase.execute).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException for non-PCS URL', async () => {
    await expect(controller.getRaceProfile('https://example.com/some-page')).rejects.toThrow(
      BadRequestException,
    );
    expect(mockUseCase.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['localhost', 'http://localhost/race/x/2024'],
    ['loopback', 'http://127.0.0.1/race/x/2024'],
    ['private network', 'http://10.0.0.1/race/x/2024'],
    ['metadata IP', 'http://169.254.169.254/latest/meta-data/'],
    [
      'metadata IP with procyclingstats substring bypass',
      'http://169.254.169.254/?procyclingstats.com/race/x/2024',
    ],
    ['credentials bypass', 'https://www.procyclingstats.com@evil.com/race/x/2024'],
    ['wrong protocol', 'file:///etc/passwd'],
    ['look-alike host', 'https://evilprocyclingstats.com/race/x/2024'],
  ])('rejects SSRF payload (%s)', async (_label, url) => {
    await expect(controller.getRaceProfile(url)).rejects.toThrow(BadRequestException);
    expect(mockUseCase.execute).not.toHaveBeenCalled();
  });

  it('should propagate NotFoundException from use case', async () => {
    mockUseCase.execute.mockRejectedValueOnce(new NotFoundException('Could not determine profile'));

    await expect(
      controller.getRaceProfile('https://www.procyclingstats.com/race/unknown/2025'),
    ).rejects.toThrow(NotFoundException);
  });
});
