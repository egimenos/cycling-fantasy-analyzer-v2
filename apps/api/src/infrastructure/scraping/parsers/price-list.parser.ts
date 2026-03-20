import * as cheerio from 'cheerio';

export interface ParsedPriceEntry {
  readonly name: string;
  readonly team: string;
  readonly price: number;
}

/**
 * Parses a price list table from grandesminivueltas.com.
 *
 * The page contains an HTML table with 4 columns:
 *   Código | Ciclista | Equipo | Precio
 *
 * We extract columns 2 (name), 3 (team), 4 (price).
 */
export function parsePriceListPage(html: string): ParsedPriceEntry[] {
  const $ = cheerio.load(html);
  const entries: ParsedPriceEntry[] = [];

  // Find all table rows — the price table has rows with 4+ cells
  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;

    const name = $(cells[1]).text().trim();
    const team = $(cells[2]).text().trim();
    const priceText = $(cells[3])
      .text()
      .trim()
      .replace(/[^0-9]/g, '');
    const price = parseInt(priceText, 10);

    if (name && team && !isNaN(price) && price > 0) {
      entries.push({ name, team, price });
    }
  });

  return entries;
}
