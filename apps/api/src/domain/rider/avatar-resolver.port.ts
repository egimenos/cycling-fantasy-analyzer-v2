export interface RiderIdentifier {
  pcsSlug: string;
  fullName: string;
}

export interface AvatarResult {
  pcsSlug: string;
  avatarUrl: string;
}

export interface AvatarResolverPort {
  resolveAvatars(riders: RiderIdentifier[]): Promise<AvatarResult[]>;
}

export const AVATAR_RESOLVER_PORT = Symbol('AvatarResolverPort');
