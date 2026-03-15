import { Module } from '@nestjs/common';
import { DatabaseModule } from './infrastructure/database/database.module';
import { ScrapingModule } from './presentation/scraping.module';

@Module({
  imports: [DatabaseModule, ScrapingModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
