import { Rider } from './rider.entity';

export interface RiderRepositoryPort {
  findByPcsSlug(pcsSlug: string): Promise<Rider | null>;
  findByPcsSlugs(pcsSlugs: string[]): Promise<Rider[]>;
  findByIds(ids: string[]): Promise<Rider[]>;
  findAll(): Promise<Rider[]>;
  findMissingAvatars(): Promise<Rider[]>;
  save(rider: Rider): Promise<void>;
  saveMany(riders: Rider[]): Promise<void>;
}

export const RIDER_REPOSITORY_PORT = Symbol('RiderRepositoryPort');
