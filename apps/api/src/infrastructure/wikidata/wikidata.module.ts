import { Module } from '@nestjs/common';
import { AVATAR_RESOLVER_PORT } from '../../domain/rider/avatar-resolver.port';
import { WikidataAvatarResolverAdapter } from './wikidata-avatar-resolver.adapter';

@Module({
  providers: [
    {
      provide: AVATAR_RESOLVER_PORT,
      useClass: WikidataAvatarResolverAdapter,
    },
  ],
  exports: [AVATAR_RESOLVER_PORT],
})
export class WikidataModule {}
