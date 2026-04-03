import { Controller, Get, Inject } from '@nestjs/common';
import { DRIZZLE, DrizzleDatabase } from '../infrastructure/database/drizzle.provider';
import { sql } from 'drizzle-orm';

@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  @Get()
  async check() {
    await this.db.execute(sql`SELECT 1`);
    return { status: 'ok' };
  }
}
