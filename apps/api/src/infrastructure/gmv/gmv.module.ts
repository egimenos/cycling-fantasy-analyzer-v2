import { Module } from '@nestjs/common';
import { GMV_CLIENT_PORT } from '../../domain/gmv/gmv-client.port';
import { GmvClientAdapter } from './gmv-client.adapter';
import { GmvPostCacheService } from './gmv-post-cache.service';

@Module({
  providers: [
    GmvClientAdapter,
    {
      provide: GMV_CLIENT_PORT,
      useClass: GmvPostCacheService,
    },
  ],
  exports: [GMV_CLIENT_PORT],
})
export class GmvModule {}
