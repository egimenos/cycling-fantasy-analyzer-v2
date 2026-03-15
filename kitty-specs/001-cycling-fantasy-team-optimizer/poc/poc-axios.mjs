import axios from 'axios';
import * as cheerio from 'cheerio';

const TEST_URLS = [
  { name: 'TdF 2024 GC', url: 'https://www.procyclingstats.com/race/tour-de-france/2024/gc' },
  { name: 'MSR 2024', url: 'https://www.procyclingstats.com/race/milano-sanremo/2024' },
  { name: 'Calendar 2025 UWT', url: 'https://www.procyclingstats.com/races.php?year=2025&circuit=1&filter=Filter' },
];

// Strategy 1: Full browser-like headers (as defined in WP03)
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'max-age=0',
};

// Strategy 2: Minimal headers
const MINIMAL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// Strategy 3: No custom headers (default axios)
const NO_HEADERS = {};

async function testStrategy(strategyName, headers, url, urlName) {
  try {
    const start = Date.now();
    const response = await axios.get(url, {
      headers,
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: () => true, // Don't throw on non-2xx
    });
    const elapsed = Date.now() - start;

    const status = response.status;
    const bodyLen = response.data?.length || 0;
    const contentType = response.headers['content-type'] || '';

    // Quick parse check: does it contain actual race data?
    let hasResults = false;
    let hasCloudflare = false;
    let sampleText = '';

    if (typeof response.data === 'string') {
      hasCloudflare = response.data.includes('cf-') || response.data.includes('Cloudflare') || response.data.includes('challenge-platform');
      hasResults = response.data.includes('table') && response.data.includes('results');

      if (hasResults) {
        const $ = cheerio.load(response.data);
        const table = $('div.resTab:not(.hide) table.results');
        const rowCount = table.find('tbody tr').length;
        const calTable = $('table.basic, table[class*="basic"]');
        const calRows = calTable.find('tbody tr').length;
        sampleText = `results_table_rows=${rowCount}, calendar_rows=${calRows}`;
      }
    }

    console.log(`[${strategyName}] ${urlName}: HTTP ${status} | ${bodyLen} bytes | ${elapsed}ms | cloudflare=${hasCloudflare} | data=${hasResults} | ${sampleText}`);
    return { status, hasResults, hasCloudflare };
  } catch (err) {
    console.log(`[${strategyName}] ${urlName}: ERROR ${err.code || err.message}`);
    return { status: 0, hasResults: false, hasCloudflare: false };
  }
}

console.log('=== AXIOS POC: Testing PCS Cloudflare bypass ===\n');

const strategies = [
  { name: 'full-browser-headers', headers: BROWSER_HEADERS },
  { name: 'minimal-ua-only', headers: MINIMAL_HEADERS },
  { name: 'no-headers', headers: NO_HEADERS },
];

for (const strategy of strategies) {
  console.log(`\n--- Strategy: ${strategy.name} ---`);
  for (const { name, url } of TEST_URLS) {
    await testStrategy(strategy.name, strategy.headers, url, name);
    // Small delay between requests
    await new Promise(r => setTimeout(r, 1500));
  }
}

console.log('\n=== Done ===');
