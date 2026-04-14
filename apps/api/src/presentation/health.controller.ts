import { Controller, Get, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DRIZZLE, DrizzleDatabase } from '../infrastructure/database/drizzle.provider';
import { sql } from 'drizzle-orm';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  @Get('liveness')
  liveness() {
    return { status: 'ok' };
  }

  @Get('readiness')
  async readiness() {
    await this.db.execute(sql`SELECT 1`);
    return { status: 'ok' };
  }
}
