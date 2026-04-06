export interface AvatarResult {
  pcsSlug: string;
  avatarUrl: string;
}

export interface AvatarResolverPort {
  resolveAvatars(pcsSlugs: string[]): Promise<AvatarResult[]>;
}

export const AVATAR_RESOLVER_PORT = Symbol('AvatarResolverPort');
