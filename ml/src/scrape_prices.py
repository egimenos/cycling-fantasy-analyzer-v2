"""
Scrape historical rider prices from grandesminivueltas.com and persist to rider_prices table.
Standalone CLI script — does not require the NestJS API.

Discovers race pages via the site's category archives, parses HTML price tables,
matches riders to the database via normalized name matching, and persists prices.

Usage:
    python ml/src/scrape_prices.py                    # scrape all missing races
    python ml/src/scrape_prices.py --discover-only    # just list available URLs
    python ml/src/scrape_prices.py --url <url>        # scrape a single URL
"""

import os
import re
import sys
import time
import unicodedata
from html.parser import HTMLParser

import psycopg2
import psycopg2.extras
import urllib.request

DB_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
)

BASE_URL = 'https://grandesminivueltas.com'
DELAY = 1.5  # seconds between requests

# Women's race URL patterns to filter out
WOMEN_PATTERNS = [
    'women', 'femenin', 'femmes', 'donne', '-we-', 'womens',
    'ladies', 'femenina', 'burgos-femenina',
]

# Map grandesminivueltas race slugs to our DB race slugs
# Only needed when they differ significantly
RACE_SLUG_MAP = {
    'lavuelta': 'vuelta-a-espana',
    'la-vuelta': 'vuelta-a-espana',
    'tour-de-francia': 'tour-de-france',
    'giro-de-italia': 'giro-d-italia',
    'paris-niza': 'paris-nice',
    'volta-catalunya': 'volta-a-catalunya',
    'volta-a-catalunya': 'volta-a-catalunya',
    'tirreno-adriatico': 'tirreno-adriatico',
    'strade-bianche': 'strade-bianche',
    'milano-sanremo': 'milano-sanremo',
    'milan-sanremo': 'milano-sanremo',
    'itzulia': 'itzulia-basque-country',
    'dauphine': 'dauphine',
    'criterium-du-dauphine': 'dauphine',
    'tour-de-suiza': 'tour-de-suisse',
    'tour-de-romandia': 'tour-de-romandie',
    'tour-de-polonia': 'tour-de-pologne',
    'tour-de-los-alpes': 'tour-of-the-alps',
    'lieja-bastogne-lieja': 'liege-bastogne-liege',
    'lieja': 'liege-bastogne-liege',
    'flecha-brabanzona': 'brabantse-pijl',
    'amstel-gold-race': 'amstel-gold-race',
    'la-fleche-wallonne': 'la-fleche-wallonne',
    'paris-roubaix': 'paris-roubaix',
    'tour-de-flandes': 'ronde-van-vlaanderen',
    'gante-wevelgem': 'gent-wevelgem',
    'e3-saxo-classic': 'e3-saxo-classic',
    'dwars-door-vlaanderen': 'dwars-door-vlaanderen',
    'clasic-brugge-de-panne': 'classic-brugge-de-panne',
    'scheldeprijs': 'scheldeprijs',
    'omloop-het-nieuwsblad': 'omloop-het-nieuwsblad',
    'uae-tour': 'uae-tour',
    'volta-ao-algarve': 'volta-ao-algarve',
    'volta-a-la-comunitat-valenciana': 'vuelta-a-la-comunidad-valenciana',
    'volta-comunitat-valenciana': 'vuelta-a-la-comunidad-valenciana',
    'tour-down-under': 'tour-down-under',
    'il-lombardia': 'il-lombardia',
    'renewi-tour': 'renewi-tour',
    'tour-de-luxemburgo': 'tour-de-luxembourg',
}


def fetch_page(url: str) -> str:
    """Fetch a page with basic headers."""
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
    })
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode('utf-8', errors='replace')


def normalize_name(name: str) -> str:
    """Normalize a rider name for matching: lowercase, no accents, no extra spaces."""
    # NFD decomposition to separate base characters from accents
    nfkd = unicodedata.normalize('NFKD', name)
    ascii_only = ''.join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', ascii_only.lower().strip())


def is_women_race(url: str) -> bool:
    """Check if a URL is for a women's race."""
    url_lower = url.lower()
    return any(p in url_lower for p in WOMEN_PATTERNS)


def extract_race_info_from_url(url: str) -> dict | None:
    """Extract year and race slug from a grandesminivueltas URL.

    Example URLs:
      /index.php/2025/08/21/lavuelta2025/
      /index.php/2024/03/18/volta-a-catalunya-equipos-y-elecciones/
      /index.php/2025/07/05/tour-de-francia-2025-equipos-y-elecciones/
    """
    # Match the URL pattern
    m = re.search(r'/(\d{4})/\d{2}/\d{2}/([^/]+)/?', url)
    if not m:
        return None

    url_year = int(m.group(1))
    slug_raw = m.group(2).rstrip('/')

    # Remove common suffixes
    slug = re.sub(r'-equipos-y-elecciones$', '', slug_raw)
    slug = re.sub(r'-equipos$', '', slug)

    # Extract year from slug if present (e.g., "lavuelta2025" → "lavuelta", year=2025)
    year_in_slug = re.search(r'(\d{4})$', slug)
    if year_in_slug:
        race_year = int(year_in_slug.group(1))
        slug = slug[:year_in_slug.start()].rstrip('-')
    else:
        # Try year pattern like "-2025" in slug
        year_suffix = re.search(r'-(\d{4})$', slug)
        if year_suffix:
            race_year = int(year_suffix.group(1))
            slug = slug[:year_suffix.start()]
        else:
            race_year = url_year

    # Map to our DB race slug
    db_slug = RACE_SLUG_MAP.get(slug, slug)

    return {
        'year': race_year,
        'slug': db_slug,
        'original_slug': slug_raw,
        'url': url,
    }


def parse_price_table(html: str) -> list[dict]:
    """Parse the price table from a grandesminivueltas page.

    Returns list of {name, team, price} dicts.
    Mirrors the logic from price-list.parser.ts.
    """
    entries = []

    # Simple regex-based table parsing (no external dependency)
    # Find all table rows
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)

    for row in rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
        if len(cells) < 4:
            continue

        # Strip HTML tags from cells
        def strip_tags(s):
            return re.sub(r'<[^>]+>', '', s).strip()

        name = strip_tags(cells[1])
        team = strip_tags(cells[2])
        price_text = re.sub(r'[^0-9]', '', strip_tags(cells[3]))

        if name and team and price_text:
            price = int(price_text)
            if price > 0:
                entries.append({
                    'name': name,
                    'team': team,
                    'price': price,
                    'normalized_name': normalize_name(name),
                })

    return entries


def discover_race_urls(category_urls: list[str] | None = None) -> list[dict]:
    """Discover all race price URLs from grandesminivueltas.com.

    Browses category archive pages to find URLs containing 'equipos'.
    """
    if category_urls is None:
        category_urls = [
            f'{BASE_URL}/index.php/category/carreras/grandes-vueltas-carreras/',
            f'{BASE_URL}/index.php/category/carreras/masculinas-carreras/',
        ]

    # Also check multiple archive pages
    for page_num in range(2, 20):
        category_urls.append(
            f'{BASE_URL}/index.php/category/carreras/masculinas-carreras/page/{page_num}/'
        )
        category_urls.append(
            f'{BASE_URL}/index.php/category/carreras/grandes-vueltas-carreras/page/{page_num}/'
        )

    all_urls = set()
    for cat_url in category_urls:
        try:
            html = fetch_page(cat_url)
            # Find all links containing 'equipos'
            links = re.findall(r'href="([^"]*equipos[^"]*)"', html, re.IGNORECASE)
            for link in links:
                if not link.startswith('http'):
                    link = BASE_URL + link
                all_urls.add(link)
            time.sleep(DELAY)
        except Exception as e:
            # Page might not exist (e.g., page/15/ returns 404)
            if '404' not in str(e) and 'HTTP Error' not in str(e):
                print(f"  Warning: {cat_url}: {e}")
            break  # Stop paginating when we get 404

    # Filter out women's races
    men_urls = [u for u in all_urls if not is_women_race(u)]

    # Parse race info from each URL
    races = []
    for url in sorted(men_urls):
        info = extract_race_info_from_url(url)
        if info:
            races.append(info)

    return races


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Scrape rider prices from grandesminivueltas.com')
    parser.add_argument('--discover-only', action='store_true', help='Only list available URLs')
    parser.add_argument('--url', type=str, help='Scrape a single URL')
    parser.add_argument('--year', type=int, help='Only scrape races from this year')
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # Load rider lookup: normalized_name → rider_id
    cur.execute("SELECT id, full_name, normalized_name, pcs_slug FROM riders")
    riders_db = cur.fetchall()
    rider_lookup = {}
    for r in riders_db:
        norm = normalize_name(r['full_name'])
        rider_lookup[norm] = r['id']
        # Also index by last-name-first format variations
        parts = norm.split()
        if len(parts) >= 2:
            # "vingegaard jonas" → also match
            rider_lookup[norm] = r['id']

    print(f"Loaded {len(rider_lookup)} riders for matching")

    # Check what we already have
    cur.execute("SELECT DISTINCT race_slug, year FROM rider_prices")
    existing = {(row['race_slug'], row['year']) for row in cur.fetchall()}
    print(f"Already scraped: {len(existing)} races")

    if args.url:
        # Single URL mode
        races = []
        info = extract_race_info_from_url(args.url)
        if info:
            info['url'] = args.url
            races = [info]
        else:
            print(f"Could not parse URL: {args.url}")
            sys.exit(1)
    else:
        # Discovery mode
        print("\nDiscovering race URLs...")
        races = discover_race_urls()
        print(f"Found {len(races)} men's race pages")

    if args.year:
        races = [r for r in races if r['year'] == args.year]
        print(f"Filtered to {len(races)} races for year {args.year}")

    if args.discover_only:
        print(f"\n{'Year':>5} {'DB Slug':40s} {'URL Slug':40s} {'Status'}")
        print("-" * 95)
        for r in sorted(races, key=lambda x: (x['year'], x['slug'])):
            status = 'DONE' if (r['slug'], r['year']) in existing else 'pending'
            print(f"{r['year']:>5} {r['slug']:40s} {r['original_slug']:40s} {status}")
        conn.close()
        return

    # Scrape mode
    total_inserted = 0
    total_unmatched = 0
    races_processed = 0

    for race in sorted(races, key=lambda x: (x['year'], x['slug'])):
        if (race['slug'], race['year']) in existing:
            continue

        url = race['url']
        print(f"\n  [{race['year']}] {race['slug']} ← {url}")

        try:
            html = fetch_page(url)
            entries = parse_price_table(html)

            if not entries:
                print(f"    WARNING: No price entries found")
                time.sleep(DELAY)
                continue

            matched = 0
            unmatched = 0
            unmatched_names = []

            for entry in entries:
                # Try to match rider
                rider_id = rider_lookup.get(entry['normalized_name'])

                if not rider_id:
                    # Try partial matching: last name + first initial
                    for db_name, db_id in rider_lookup.items():
                        if entry['normalized_name'] == db_name:
                            rider_id = db_id
                            break

                if rider_id:
                    try:
                        cur.execute("""
                            INSERT INTO rider_prices (rider_id, race_slug, year, price_hillios, raw_name, source_url)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (rider_id, race_slug, year) DO UPDATE
                            SET price_hillios = EXCLUDED.price_hillios,
                                raw_name = EXCLUDED.raw_name,
                                source_url = EXCLUDED.source_url
                        """, (rider_id, race['slug'], race['year'], entry['price'],
                              entry['name'], url))
                        matched += 1
                    except Exception as e:
                        print(f"    DB error for {entry['name']}: {e}")
                        conn.rollback()
                else:
                    unmatched += 1
                    unmatched_names.append(entry['name'])

            conn.commit()
            total_inserted += matched
            total_unmatched += unmatched
            races_processed += 1

            print(f"    {len(entries)} entries: {matched} matched, {unmatched} unmatched")
            if unmatched_names and len(unmatched_names) <= 10:
                for name in unmatched_names:
                    print(f"      UNMATCHED: {name}")
            elif unmatched_names:
                print(f"      UNMATCHED: {unmatched_names[:5]}... (+{len(unmatched_names)-5} more)")

        except Exception as e:
            print(f"    ERROR: {e}")

        time.sleep(DELAY)

    conn.close()
    print(f"\nDone: {races_processed} races, {total_inserted} prices inserted, {total_unmatched} unmatched riders")


if __name__ == '__main__':
    main()
