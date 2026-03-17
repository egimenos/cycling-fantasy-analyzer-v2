import { Rider } from './rider.entity';

export interface RiderRepositoryPort {
  findByPcsSlug(pcsSlug: string): Promise<Rider | null>;
  findAll(): Promise<Rider[]>;
  save(rider: Rider): Promise<void>;
}

export const RIDER_REPOSITORY_PORT = Symbol('RiderRepositoryPort');
