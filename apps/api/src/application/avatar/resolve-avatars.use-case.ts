import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  RiderRepositoryPort,
  RIDER_REPOSITORY_PORT,
} from '../../domain/rider/rider.repository.port';
import { AvatarResolverPort, AVATAR_RESOLVER_PORT } from '../../domain/rider/avatar-resolver.port';

export interface ResolveAvatarsResult {
  resolved: number;
  total: number;
}

@Injectable()
export class ResolveAvatarsUseCase {
  private readonly logger = new Logger(ResolveAvatarsUseCase.name);

  constructor(
    @Inject(RIDER_REPOSITORY_PORT) private readonly riderRepo: RiderRepositoryPort,
    @Inject(AVATAR_RESOLVER_PORT) private readonly avatarResolver: AvatarResolverPort,
  ) {}

  async execute(): Promise<ResolveAvatarsResult> {
    const ridersWithoutAvatar = await this.riderRepo.findMissingAvatars();
    if (ridersWithoutAvatar.length === 0) {
      this.logger.log('All riders already have avatars');
      return { resolved: 0, total: 0 };
    }

    this.logger.log(`Resolving avatars for ${ridersWithoutAvatar.length} riders...`);

    const slugs = ridersWithoutAvatar.map((r) => r.pcsSlug);
    const results = await this.avatarResolver.resolveAvatars(slugs);

    const avatarMap = new Map(results.map((r) => [r.pcsSlug, r.avatarUrl]));

    const updatedRiders = ridersWithoutAvatar
      .filter((r) => avatarMap.has(r.pcsSlug))
      .map((r) => r.updateAvatarUrl(avatarMap.get(r.pcsSlug)!));

    if (updatedRiders.length > 0) {
      await this.riderRepo.saveMany(updatedRiders);
    }

    return { resolved: updatedRiders.length, total: ridersWithoutAvatar.length };
  }
}
