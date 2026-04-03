import { Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { CorrelationStore } from './correlation.store';
import {
  InsufficientRidersError,
  ConflictingConstraintsError,
  RiderNotFoundError,
  BudgetExceededByLockedRidersError,
} from '../../domain/optimizer/errors';
import {
  EmptyPriceListError,
  MlServiceUnavailableError,
  EmptyStartlistError,
  MlPredictionFailedError,
  RaceUrlParseError,
  RaceProfileNotFoundError,
} from '../../domain/analyze/errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DOMAIN_ERROR_MAP = new Map<new (...args: any[]) => Error, HttpStatus>([
  [ConflictingConstraintsError, HttpStatus.BAD_REQUEST],
  [BudgetExceededByLockedRidersError, HttpStatus.BAD_REQUEST],
  [RiderNotFoundError, HttpStatus.BAD_REQUEST],
  [InsufficientRidersError, HttpStatus.UNPROCESSABLE_ENTITY],
  [EmptyPriceListError, HttpStatus.UNPROCESSABLE_ENTITY],
  [MlServiceUnavailableError, HttpStatus.UNPROCESSABLE_ENTITY],
  [EmptyStartlistError, HttpStatus.UNPROCESSABLE_ENTITY],
  [MlPredictionFailedError, HttpStatus.UNPROCESSABLE_ENTITY],
  [RaceUrlParseError, HttpStatus.NOT_FOUND],
  [RaceProfileNotFoundError, HttpStatus.NOT_FOUND],
]);

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly correlationStore: CorrelationStore,
  ) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const correlationId = this.correlationStore.getId();

    // Already an HttpException (e.g. BadRequestException, ValidationPipe errors)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const body =
        typeof exceptionResponse === 'string'
          ? { statusCode: status, message: exceptionResponse }
          : (exceptionResponse as Record<string, unknown>);

      if (status >= 500) {
        this.pinoLogger.error({ err: exception, correlationId }, exception.message);
      } else {
        this.pinoLogger.warn({ statusCode: status, correlationId }, exception.message);
      }

      response.status(status).json({ ...body, correlationId });
      return;
    }

    // Known domain errors → mapped HTTP status
    if (exception instanceof Error) {
      for (const [ErrorClass, status] of DOMAIN_ERROR_MAP) {
        if (exception instanceof ErrorClass) {
          this.pinoLogger.warn(
            { err: exception, statusCode: status, correlationId },
            exception.message,
          );
          response.status(status).json({
            statusCode: status,
            message: exception.message,
            correlationId,
          });
          return;
        }
      }
    }

    // Unknown error → 500
    const message = exception instanceof Error ? exception.message : 'Internal server error';
    this.pinoLogger.error({ err: exception, correlationId }, `Unhandled: ${message}`);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      correlationId,
    });
  }
}
