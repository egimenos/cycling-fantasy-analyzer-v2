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
      const allPosts: GmvPost[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const url = `${GMV_WP_API_URL}?categories=${GMV_CATEGORIES}&per_page=100&page=${page}&_fields=id,title,link,date`;
        this.logger.debug(`Fetching GMV posts page ${page}: ${url}`);

        const response = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          this.logger.error(`GMV API returned ${response.status} on page ${page}`);
          break;
        }

        if (page === 1) {
          totalPages = parseInt(response.headers.get('x-wp-totalpages') ?? '1', 10);
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

        allPosts.push(...posts);
        page++;
      } while (page <= totalPages);

      this.logger.debug(`Fetched ${allPosts.length} GMV price list posts (${totalPages} pages)`);
      return allPosts;
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
