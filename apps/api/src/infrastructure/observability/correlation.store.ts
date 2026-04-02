import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

interface CorrelationContext {
  correlationId: string;
}

@Injectable()
export class CorrelationStore {
  private readonly storage = new AsyncLocalStorage<CorrelationContext>();

  run<T>(correlationId: string, fn: () => T): T {
    return this.storage.run({ correlationId }, fn);
  }

  getId(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }
}
