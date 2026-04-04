import { GmvPost } from './gmv-post';

export interface GmvClientPort {
  /** Fetch GMV posts (implementations may cache internally) */
  getPosts(): Promise<GmvPost[]>;
}

export const GMV_CLIENT_PORT = Symbol('GmvClientPort');
