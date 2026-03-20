"""
Scrape birth dates from PCS rider pages and persist to riders.birth_date.
Standalone script — does not require re-seeding.

Usage: ml/.venv/bin/python ml/src/scrape_birth_dates.py
"""

import os
import re
import time

import psycopg2
import psycopg2.extras
import urllib.request

DB_URL = os.environ.get('DATABASE_URL',
    'postgresql://cycling:cycling@localhost:5432/cycling_analyzer')

PCS_BASE = 'https://www.procyclingstats.com'
DELAY = 1.2  # seconds between requests


def fetch_page(url: str) -> str:
    """Fetch a PCS page with basic headers."""
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode('utf-8', errors='replace')


def parse_birth_date(html: str) -> str | None:
    """Extract birth date from PCS rider page. Returns YYYY-MM-DD or None."""
    months = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12,
    }

    # Method 1: meta description contains "born YYYY-MM-DD"
    meta_match = re.search(r'born\s+(\d{4})-(\d{2})-(\d{2})', html)
    if meta_match:
        year, month, day = int(meta_match.group(1)), int(meta_match.group(2)), int(meta_match.group(3))
        if 1900 < year < 2015:
            return f'{year:04d}-{month:02d}-{day:02d}'

    # Method 2: PCS puts date in separate divs after "Date of birth:"
    # <div>21st</div><div>September</div><div>1998</div>
    # Strip HTML tags and look for the pattern
    stripped = re.sub(r'<[^>]+>', ' ', html)
    patterns = [
        r'Date of birth:\s*(\d{1,2})\w*\s+(\w+)\s+(\d{4})',
        r'born.*?(\d{1,2})\w*\s+(\w+)\s+(\d{4})',
    ]

    for pattern in patterns:
        match = re.search(pattern, stripped, re.IGNORECASE)
        if match:
            day = int(match.group(1))
            month_name = match.group(2).lower()
            year = int(match.group(3))
            month = months.get(month_name)
            if month and 1900 < year < 2015 and 1 <= day <= 31:
                return f'{year:04d}-{month:02d}-{day:02d}'

    return None


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # Get riders without birth_date
    cur.execute("""
        SELECT id, pcs_slug, full_name
        FROM riders
        WHERE birth_date IS NULL
        ORDER BY last_scraped_at DESC NULLS LAST
    """)
    riders = cur.fetchall()
    total = len(riders)
    print(f"Riders without birth_date: {total}")

    updated = 0
    failed = 0
    skipped = 0

    for i, rider in enumerate(riders):
        slug = rider['pcs_slug']
        url = f"{PCS_BASE}/rider/{slug}"

        try:
            html = fetch_page(url)
            birth_date = parse_birth_date(html)

            if birth_date:
                cur.execute(
                    "UPDATE riders SET birth_date = %s WHERE id = %s",
                    (birth_date, rider['id'])
                )
                conn.commit()
                updated += 1
            else:
                skipped += 1

        except Exception as e:
            failed += 1
            if failed <= 5:
                print(f"  ERROR {slug}: {e}")

        if (i + 1) % 50 == 0:
            print(f"  [{i+1}/{total}] updated={updated} skipped={skipped} failed={failed}")

        time.sleep(DELAY)

    conn.close()
    print(f"\nDone: {updated} updated, {skipped} no date found, {failed} errors")


if __name__ == '__main__':
    main()
