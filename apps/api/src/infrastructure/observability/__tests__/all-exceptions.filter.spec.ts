import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from '../all-exceptions.filter';
import { CorrelationStore } from '../correlation.store';
import {
  InsufficientRidersError,
  ConflictingConstraintsError,
  RiderNotFoundError,
  BudgetExceededByLockedRidersError,
} from '../../../domain/optimizer/errors';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let correlationStore: CorrelationStore;
  let mockLogger: { warn: jest.Mock; error: jest.Mock };
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let mockHost: { switchToHttp: jest.Mock };

  beforeEach(() => {
    correlationStore = new CorrelationStore();
    mockLogger = { warn: jest.fn(), error: jest.fn() };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => ({}),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter = new AllExceptionsFilter(mockLogger as any, correlationStore);
  });

  const callFilter = (exception: unknown) =>
    correlationStore.run('test-corr-id', () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filter.catch(exception, mockHost as any),
    );

  describe('HttpException passthrough', () => {
    it('should pass through BadRequestException with correlationId', () => {
      callFilter(new BadRequestException('Invalid input'));

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Invalid input',
          correlationId: 'test-corr-id',
        }),
      );
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should log 5xx HttpExceptions at error level', () => {
      callFilter(new HttpException('Service unavailable', HttpStatus.SERVICE_UNAVAILABLE));

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('domain error mapping', () => {
    it('should map ConflictingConstraintsError to 400', () => {
      callFilter(new ConflictingConstraintsError(['r1', 'r2']));

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          correlationId: 'test-corr-id',
        }),
      );
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should map BudgetExceededByLockedRidersError to 400', () => {
      callFilter(new BudgetExceededByLockedRidersError(1500, 1000));

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });

    it('should map RiderNotFoundError to 400', () => {
      callFilter(new RiderNotFoundError('pogacar'));

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Rider not found in pool: pogacar' }),
      );
    });

    it('should map InsufficientRidersError to 422', () => {
      callFilter(new InsufficientRidersError(5, 9));

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  describe('unknown errors', () => {
    it('should map unknown Error to 500 with safe message', () => {
      callFilter(new Error('DB connection lost'));

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Internal server error',
          correlationId: 'test-corr-id',
        }),
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle non-Error thrown values', () => {
      callFilter('string error');

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Internal server error' }),
      );
    });
  });

  describe('correlation ID', () => {
    it('should include correlationId in all responses', () => {
      callFilter(new BadRequestException('test'));
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: 'test-corr-id' }),
      );
    });

    it('should handle missing correlation ID gracefully', () => {
      // Call without correlationStore.run wrapper
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filter.catch(new Error('test'), mockHost as any);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: undefined }),
      );
    });
  });
});
