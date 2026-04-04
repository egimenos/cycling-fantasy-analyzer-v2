import { Injectable, Logger } from '@nestjs/common';
import { GmvPost } from '../../domain/gmv/gmv-post';

const GMV_WP_API_URL = 'https://grandesminivueltas.com/wp-json/wp/v2/posts';
const GMV_CATEGORIES = '23,21'; // masculinas-carreras + grandes-vueltas-carreras
const EXCLUDED_TITLE_PATTERNS = ['Equipos y elecciones', 'Calendario'];

@Injectable()
export class GmvClientAdapter {
  private readonly logger = new Logger(GmvClientAdapter.name);

  async fetchPostsFromApi(): Promise<GmvPost[]> {
    try {
      const url = `${GMV_WP_API_URL}?categories=${GMV_CATEGORIES}&per_page=100&_fields=id,title,link,date`;
      this.logger.debug(`Fetching GMV posts: ${url}`);

      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        this.logger.error(`GMV API returned ${response.status}`);
        return [];
      }

      const rawPosts = (await response.json()) as Array<{
        id: number;
        title: { rendered: string };
        link: string;
        date: string;
      }>;

      const posts = rawPosts
        .filter(
          (p) => !EXCLUDED_TITLE_PATTERNS.some((pattern) => p.title.rendered.includes(pattern)),
        )
        .map((p) => ({
          id: p.id,
          title: this.decodeHtmlEntities(p.title.rendered),
          url: p.link,
          date: p.date,
        }));

      this.logger.debug(`Fetched ${posts.length} GMV price list posts`);
      return posts;
    } catch (error) {
      this.logger.warn(`GMV API unavailable: ${(error as Error).message}`);
      return [];
    }
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&#8211;/g, '–')
      .replace(/&#8212;/g, '—')
      .replace(/&#038;/g, '&')
      .replace(/&amp;/g, '&');
  }
}
