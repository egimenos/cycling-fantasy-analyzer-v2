import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { IncomingMessage } from 'node:http';
import { CorrelationStore } from './correlation.store';
import { AllExceptionsFilter } from './all-exceptions.filter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let otelApi: any;

try {
  // Optional: link logs to traces when OTel is loaded via -r flag
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  otelApi = require('@opentelemetry/api');
} catch {
  // OTel not installed or not loaded — traces won't appear in logs
}

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get('NODE_ENV') === 'production';
        const logLevel = config.get('LOG_LEVEL') ?? (isProduction ? 'info' : 'debug');

        return {
          pinoHttp: {
            level: logLevel,
            genReqId: (req: IncomingMessage) => {
              // Correlation ID already normalized by Express middleware in main.ts
              return req.headers['x-correlation-id'] as string;
            },
            customProps: () => ({ service: 'cycling-api' }),
            customLogLevel: (_req: IncomingMessage, res: { statusCode: number }) => {
              if (res.statusCode >= 500) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'info';
            },
            quietReqLogger: true,
            ...(isProduction
              ? {}
              : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
            mixin() {
              const extra: Record<string, string> = {};
              if (otelApi) {
                const span = otelApi.trace.getSpan(otelApi.context.active());
                if (span) {
                  const ctx = span.spanContext();
                  extra.traceId = ctx.traceId;
                  extra.spanId = ctx.spanId;
                }
              }
              return extra;
            },
          },
        };
      },
    }),
  ],
  providers: [CorrelationStore, AllExceptionsFilter],
  exports: [CorrelationStore, AllExceptionsFilter],
})
export class ObservabilityModule {}
