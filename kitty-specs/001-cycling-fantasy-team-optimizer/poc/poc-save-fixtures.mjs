/**
 * Save HTML fixtures for WP03 tests and verify full parsing.
 * These will be committed as test data.
 */
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

const FIXTURE_DIR = '/tmp/pcs/fixtures';
fs.mkdirSync(FIXTURE_DIR, { recursive: true });

async function fetchAndSave(url, filename) {
  console.log(`Fetching: ${url}`);
  const response = await gotScraping({
    url,
    headerGeneratorOptions: {
      browsers: [{ name: 'chrome', minVersion: 100 }],
      locales: ['en-US'],
      operatingSystems: ['windows'],
    },
  });
  const outPath = path.join(FIXTURE_DIR, filename);
  fs.writeFileSync(outPath, response.body);
  const size = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`  Saved: ${filename} (${size} KB)`);
  return response.body;
  }

console.log('=== Saving fixtures + verifying parsing ===\n');

// 1. MSR 2024 (classic) - with /result suffix
const msrHtml = await fetchAndSave(
  'https://www.procyclingstats.com/race/milano-sanremo/2024/result',
  'msr-2024-result.html'
);
const $msr = cheerio.load(msrHtml);
const msrTable = $msr('div.resTab:not(.hide) table.results');
const msrHeaders = [];
msrTable.find('thead th').each((_, th) => msrHeaders.push($msr(th).text().trim()));
const msrRiderCol = msrHeaders.indexOf('Rider');
const msrTeamCol = Math.max(msrHeaders.indexOf('Team'), msrHeaders.indexOf('Tm'));

let msrFirst = null;
let msrCount = 0;
msrTable.find('tbody tr').each((_, row) => {
  const cells = $msr(row).find('td');
  if (cells.length <= Math.max(msrRiderCol, msrTeamCol)) return;
  const posText = $msr(cells[0]).text().trim();
  if (parseInt(posText) || /^(DNF|DNS)$/i.test(posText)) {
    msrCount++;
    if (!msrFirst) {
      const link = $msr(cells[msrRiderCol]).find('a').first();
      msrFirst = { pos: posText, name: link.text().trim(), slug: link.attr('href'), team: $msr(cells[msrTeamCol]).text().trim() };
    }
  }
});
console.log(`\n  MSR 2024 winner: ${msrFirst?.name} (${msrFirst?.team}) - slug: ${msrFirst?.slug}`);
console.log(`  Total riders: ${msrCount}`);

await new Promise(r => setTimeout(r, 2000));

// 2. TdF 2024 Stage 1
const s1Html = await fetchAndSave(
  'https://www.procyclingstats.com/race/tour-de-france/2024/stage-1',
  'tdf-2024-stage-1.html'
);
// Check if stage-1 has results or if we need /result suffix
const $s1 = cheerio.load(s1Html);
const s1Table = $s1('div.resTab:not(.hide) table.results');
console.log(`\n  TdF Stage 1 (no suffix): table found = ${s1Table.length > 0}, rows = ${s1Table.find('tbody tr').length}`);

if (s1Table.length === 0) {
  console.log('  Trying with /result suffix...');
  await new Promise(r => setTimeout(r, 2000));
  const s1Html2 = await fetchAndSave(
    'https://www.procyclingstats.com/race/tour-de-france/2024/stage-1/result',
    'tdf-2024-stage-1-result.html'
  );
  const $s1b = cheerio.load(s1Html2);
  const s1TableB = $s1b('div.resTab:not(.hide) table.results');
  console.log(`  TdF Stage 1 (/result): table found = ${s1TableB.length > 0}, rows = ${s1TableB.find('tbody tr').length}`);
}

await new Promise(r => setTimeout(r, 2000));

// 3. Calendar - already confirmed working
await fetchAndSave(
  'https://www.procyclingstats.com/races.php?year=2025&circuit=1&filter=Filter',
  'races-calendar-2025-uwt.html'
);

await new Promise(r => setTimeout(r, 2000));

// 4. TdF GC - already confirmed working
await fetchAndSave(
  'https://www.procyclingstats.com/race/tour-de-france/2024/gc',
  'tdf-2024-gc.html'
);

await new Promise(r => setTimeout(r, 2000));

// 5. Paris-Nice 2024 GC (mini tour test)
const pnHtml = await fetchAndSave(
  'https://www.procyclingstats.com/race/paris-nice/2024/gc',
  'paris-nice-2024-gc.html'
);
const $pn = cheerio.load(pnHtml);
const pnTable = $pn('div.resTab:not(.hide) table.results');
const pnHeaders = [];
pnTable.find('thead th').each((_, th) => pnHeaders.push($pn(th).text().trim()));
const pnRiderCol = pnHeaders.indexOf('Rider');
let pnFirst = null;
pnTable.find('tbody tr').each((_, row) => {
  if (pnFirst) return;
  const cells = $pn(row).find('td');
  const posText = $pn(cells[0]).text().trim();
  if (posText === '1') {
    const link = $pn(cells[pnRiderCol]).find('a').first();
    pnFirst = { name: link.text().trim(), slug: link.attr('href') };
  }
});
console.log(`\n  Paris-Nice 2024 GC winner: ${pnFirst?.name}`);

console.log('\n=== All fixtures saved to /tmp/pcs/fixtures/ ===');
fs.readdirSync(FIXTURE_DIR).forEach(f => {
  const size = (fs.statSync(path.join(FIXTURE_DIR, f)).size / 1024).toFixed(1);
  console.log(`  ${f} (${size} KB)`);
});
