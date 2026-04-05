import { fuzzyMatchGmvPost } from './fuzzy-match';
import type { GmvPost } from './gmv-post';

function post(id: number, title: string): GmvPost {
  return { id, title, url: `https://gmv.com/${id}`, date: '2024-01-01' };
}

describe('fuzzyMatchGmvPost', () => {
  it('matches the correct year when multiple years exist', () => {
    const posts = [
      post(1, 'La Vuelta 2025 – Precios'),
      post(2, 'La Vuelta 2024 – Precios'),
      post(3, 'La Vuelta 2023 – Precios'),
    ];

    const result = fuzzyMatchGmvPost('vuelta-a-espana', 'Vuelta A Espana', 2024, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(2);
  });

  it('skips posts that contain a different year', () => {
    const posts = [post(1, 'La Vuelta 2025 – Precios')];

    const result = fuzzyMatchGmvPost('vuelta-a-espana', 'Vuelta A Espana', 2024, posts);

    expect(result).toBeNull();
  });

  it('matches posts with no year in the title', () => {
    const posts = [post(1, 'La Vuelta – Precios')];

    const result = fuzzyMatchGmvPost('vuelta-a-espana', 'Vuelta A Espana', 2024, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(1);
  });

  it('matches using aliases (Giro)', () => {
    const posts = [
      post(1, 'Giro de Italia 2024 – Precios'),
      post(2, 'Tour de Francia 2024 – Precios'),
    ];

    const result = fuzzyMatchGmvPost('giro-d-italia', 'Giro D Italia', 2024, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(1);
  });
});
