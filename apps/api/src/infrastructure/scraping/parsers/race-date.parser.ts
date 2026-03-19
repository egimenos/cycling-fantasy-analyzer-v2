import * as cheerio from 'cheerio';

const MONTH_MAP: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

/**
 * Matches dates in "DD Month YYYY" format, e.g. "16 March 2024" or "29 June 2024".
 */
const DATE_PATTERN =
  /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i;

/**
 * Extracts the race date from a PCS race result or stage result page.
 *
 * PCS displays the date inside a key-value list (`ul.list li`) where the title
 * div contains "Date:" and the value div contains a date string like "16 March 2024".
 *
 * Works for both one-day classics (single date) and stage race stage pages
 * (each stage has its own date).
 *
 * @returns A Date object set to UTC midnight, or null if parsing fails.
 */
export function parseRaceDate(html: string): Date | null {
  if (!html || html.trim().length === 0) {
    return null;
  }

  const $ = cheerio.load(html);

  // Strategy 1: Look for Date in PCS key-value infolist
  // PCS uses <li><div class="title">Date:</div><div class="value">29 June 2024</div></li>
  const dateValue = extractDateFromInfoList($);
  if (dateValue) {
    return dateValue;
  }

  // Strategy 2: Fallback — scan any text node matching "DD Month YYYY" inside
  // common containers (.infolist, .sub, .main-page-content, .borderbox)
  const fallbackValue = extractDateFromFallback($);
  if (fallbackValue) {
    return fallbackValue;
  }

  return null;
}

function extractDateFromInfoList($: cheerio.CheerioAPI): Date | null {
  const listItems = $('ul.infolist li, ul.list li, .infolist li');
  let result: Date | null = null;

  listItems.each((_, li) => {
    if (result) return; // already found

    const titleText = $(li).find('.title').text().trim().toLowerCase();
    if (!titleText.includes('date')) return;

    const valueText = $(li).find('.value').text().trim();
    const parsed = parseDateString(valueText);
    if (parsed) {
      result = parsed;
    }
  });

  return result;
}

function extractDateFromFallback($: cheerio.CheerioAPI): Date | null {
  // Search in common page containers for any date-like text
  const containers = ['.borderbox', '.infolist', '.sub', '.main-page-content', 'body'];
  for (const selector of containers) {
    const text = $(selector).text();
    const match = text.match(DATE_PATTERN);
    if (match) {
      return parseDateString(match[0]);
    }
  }
  return null;
}

/**
 * Parses a date string like "16 March 2024" into a UTC midnight Date.
 */
function parseDateString(text: string): Date | null {
  const match = text.match(DATE_PATTERN);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const monthName = match[2].toLowerCase();
  const year = parseInt(match[3], 10);

  const month = MONTH_MAP[monthName];
  if (month === undefined) return null;

  if (day < 1 || day > 31 || year < 1900 || year > 2100) return null;

  return new Date(Date.UTC(year, month, day));
}
