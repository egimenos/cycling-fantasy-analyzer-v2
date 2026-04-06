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

  it('matches E3 Harelbeke slug against sponsor name (E3 Saxo Classic)', () => {
    const posts = [post(1, 'E3 Saxo Classic 2025')];

    const result = fuzzyMatchGmvPost('e3-harelbeke', 'E3 Harelbeke', 2025, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(1);
  });

  it('matches E3 Saxo Classic slug against old name (E3 Harelbeke)', () => {
    const posts = [post(1, 'E3 Harelbeke 2026')];

    const result = fuzzyMatchGmvPost('e3-saxo-classic', 'E3 Saxo Classic', 2026, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(1);
  });

  it('matches Gent-Wevelgem against Spanish variant (Gante)', () => {
    const posts = [post(1, 'Gante-Wevelgem 2023')];

    const result = fuzzyMatchGmvPost('gent-wevelgem', 'Gent Wevelgem', 2023, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(1);
  });

  it('matches Brabantse Pijl against Spanish name (Flecha Brabanzona)', () => {
    const posts = [post(1, 'Flecha Brabanzona 2025')];

    const result = fuzzyMatchGmvPost('brabantse-pijl', 'Brabantse Pijl', 2025, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(1);
  });

  it('matches Cyclassics Hamburg against sponsor name (BEMER Cyclassics)', () => {
    const posts = [post(1, 'BEMER Cyclassics 2024')];

    const result = fuzzyMatchGmvPost('cyclassics-hamburg', 'Cyclassics Hamburg', 2024, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(1);
  });

  it('matches World Championship against Spanish name (Mundial)', () => {
    const posts = [
      post(1, 'Mundial 2025 – Ruta Masculina'),
      post(2, 'Mundial 2025 – CRI masculina'),
    ];

    const result = fuzzyMatchGmvPost('world-championship', 'World Championship', 2025, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(1);
  });

  it('matches Tour de Pologne against Spanish name (Tour de Polonia)', () => {
    const posts = [post(1, 'Tour de Polonia 2025')];

    const result = fuzzyMatchGmvPost('tour-de-pologne', 'Tour De Pologne', 2025, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(1);
  });

  it('matches Tour de Suisse against Spanish name (Tour de Suiza)', () => {
    const posts = [post(1, 'Tour de Suiza 2023')];

    const result = fuzzyMatchGmvPost('tour-de-suisse', 'Tour De Suisse', 2023, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(1);
  });

  it('matches Tour de Romandie against Spanish name (Tour de Romandia)', () => {
    const posts = [post(1, 'Tour de Romandia 2025')];

    const result = fuzzyMatchGmvPost('tour-de-romandie', 'Tour De Romandie', 2025, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(1);
  });

  it('matches Tour of the Alps against Spanish name (Tour de los Alpes)', () => {
    const posts = [post(1, 'Tour de los Alpes 2024')];

    const result = fuzzyMatchGmvPost('tour-of-the-alps', 'Tour Of The Alps', 2024, posts);

    expect(result).not.toBeNull();
    expect(result!.post.id).toBe(1);
  });
});
