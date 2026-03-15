/**
 * POC: Full stage race scraping flow
 * Scrapes ALL classifications for a stage race (TdF 2024):
 *   1. Fetch GC page → extract classification URLs from <select>
 *   2. For each classification: fetch page → parse results table
 *   3. Validate everything
 */
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.procyclingstats.com/';
const RACE_SLUG = 'tour-de-france';
const YEAR = 2024;
const DELAY_MS = 1500;

let lastRequestAt = 0;

async function fetchPage(path) {
  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < DELAY_MS) {
    await new Promise(r => setTimeout(r, DELAY_MS - elapsed));
  }
  lastRequestAt = Date.now();

  const url = `${BASE_URL}${path}`;
  const response = await gotScraping({
    url,
    headerGeneratorOptions: {
      browsers: [{ name: 'chrome', minVersion: 100 }],
      locales: ['en-US'],
      operatingSystems: ['windows'],
    },
    timeout: { request: 30000 },
  });

  if (response.statusCode !== 200) {
    throw new Error(`HTTP ${response.statusCode} for ${path}`);
  }
  return response.body;
}

// --- Classification URL Extractor ---
function extractClassificationUrls(html) {
  const $ = cheerio.load(html);
  const results = [];

  $('div.selectNav').each((_, container) => {
    const linkTexts = $(container).find('a').map((_, a) => $(a).text()).get();
    const hasPrevNext = linkTexts.some(t => /PREV|NEXT|«|»/i.test(t));
    if (!hasPrevNext) return;

    $(container).find('select option').each((_, option) => {
      let urlPath = $(option).attr('value');
      const optionText = $(option).text().trim().toLowerCase();
      if (!urlPath) return;

      // Normalize: strip /result/result suffix
      urlPath = urlPath.replace(/\/result\/result$/, '').replace(/\/result$/, '');

      // Skip irrelevant
      if (urlPath.includes('teams') || urlPath.includes('youth')) return;

      // Stage results
      const stageMatch = urlPath.match(/stage-(\d+)/);
      if (stageMatch && !urlPath.includes('points') && !urlPath.includes('kom')) {
        results.push({ urlPath, type: 'STAGE', stageNumber: parseInt(stageMatch[1], 10), label: optionText });
        return;
      }

      // Points/Sprint
      if (optionText.includes('points classification') || urlPath.endsWith('/points')) {
        results.push({ urlPath, type: 'SPRINT', stageNumber: null, label: optionText });
        return;
      }

      // Mountain/KOM
      if (optionText.includes('mountains classification') || urlPath.endsWith('/kom')) {
        results.push({ urlPath, type: 'MOUNTAIN', stageNumber: null, label: optionText });
        return;
      }

      // Final GC
      if (optionText.includes('gc') || urlPath.endsWith('/gc')) {
        results.push({ urlPath, type: 'GC', stageNumber: null, label: optionText });
        return;
      }
    });
  });

  return results;
}

// --- Results Table Parser ---
function parseResultsTable(html, category, stageNumber = null) {
  const $ = cheerio.load(html);
  const results = [];

  const table = $('div.resTab:not(.hide) table.results');
  if (table.length === 0) return [];

  const headers = [];
  table.find('thead th').each((_, th) => headers.push($(th).text().trim()));

  const riderCol = headers.indexOf('Rider');
  const teamCol = Math.max(headers.indexOf('Team'), headers.indexOf('Tm'));
  if (riderCol === -1) return [];

  table.find('tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length <= riderCol) return;

    const posText = $(cells[0]).text().trim();
    const isNonFinisher = /^(DNF|DNS|OTL|DSQ)$/i.test(posText);
    const position = isNonFinisher ? null : parseInt(posText, 10);
    if (!isNonFinisher && isNaN(position)) return;

    const riderLink = $(cells[riderCol]).find('a').first();
    if (riderLink.length === 0) return;

    const riderName = riderLink.text().trim();
    const riderSlug = riderLink.attr('href') || '';
    const teamName = teamCol !== -1 && cells.length > teamCol ? $(cells[teamCol]).text().trim() : '';

    results.push({
      riderName,
      riderSlug,
      teamName,
      position,
      category,
      stageNumber,
      dnf: isNonFinisher,
    });
  });

  return results;
}

// --- Validation ---
function validateClassification(results, context) {
  const errors = [];
  const warnings = [];

  if (results.length === 0) {
    errors.push(`Empty results for ${context.type} ${context.stageNumber ?? ''}`);
    return { valid: false, errors, warnings };
  }

  // Position sequence
  const positions = results.filter(r => r.position !== null).map(r => r.position).sort((a, b) => a - b);
  for (let i = 0; i < Math.min(positions.length, 5); i++) {
    if (positions[i] !== i + 1) {
      errors.push(`Position gap at ${i + 1}: got ${positions[i]}`);
      break;
    }
  }

  // DNF consistency
  const badDnf = results.filter(r => r.dnf && r.position !== null);
  if (badDnf.length > 0) {
    errors.push(`${badDnf.length} DNF riders with numeric position`);
  }

  // Rider count range
  const min = context.type === 'GC' ? 100 : context.type === 'STAGE' ? 80 : 20;
  const max = 250;
  if (results.length < min) {
    warnings.push(`Low rider count: ${results.length} (expected >= ${min})`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ========== MAIN FLOW ==========

console.log(`\n${'='.repeat(70)}`);
console.log(`  FULL STAGE RACE SCRAPING POC`);
console.log(`  Race: ${RACE_SLUG} ${YEAR}`);
console.log(`${'='.repeat(70)}\n`);

const startTime = Date.now();
const allResults = [];
const validationReport = [];

// Step 1: Fetch GC page (entry point)
console.log(`[1/3] Fetching GC page (entry point)...`);
const gcPath = `race/${RACE_SLUG}/${YEAR}/gc`;
const gcHtml = await fetchPage(gcPath);
console.log(`  ✓ GC page fetched (${(gcHtml.length / 1024).toFixed(0)} KB)\n`);

// Step 2: Extract classification URLs
console.log(`[2/3] Extracting classification URLs from <select> menu...`);
const classifications = extractClassificationUrls(gcHtml);
const stages = classifications.filter(c => c.type === 'STAGE');
const otherClassifications = classifications.filter(c => c.type !== 'STAGE');

console.log(`  Found ${classifications.length} total classifications:`);
console.log(`    Stages: ${stages.length}`);
otherClassifications.forEach(c => console.log(`    ${c.type}: ${c.urlPath}`));
console.log();

// Step 3: Scrape each classification
console.log(`[3/3] Scraping all ${classifications.length} classifications...\n`);

// Parse GC first (already have the HTML)
console.log(`  [GC] Parsing from already-fetched page...`);
const gcResults = parseResultsTable(gcHtml, 'GC');
const gcValidation = validateClassification(gcResults, { type: 'GC' });
allResults.push(...gcResults);
validationReport.push({ type: 'GC', count: gcResults.length, ...gcValidation });
console.log(`    → ${gcResults.length} riders | winner: ${gcResults[0]?.riderName} | valid: ${gcValidation.valid}`);

// Scrape each stage
for (const stage of stages) {
  const label = `Stage ${stage.stageNumber}`;
  process.stdout.write(`  [${label}] Fetching...`);

  try {
    const html = await fetchPage(stage.urlPath);
    const results = parseResultsTable(html, 'STAGE', stage.stageNumber);
    const validation = validateClassification(results, { type: 'STAGE', stageNumber: stage.stageNumber });
    allResults.push(...results);
    validationReport.push({ type: label, count: results.length, ...validation });

    const winner = results[0]?.riderName || 'N/A';
    const status = validation.valid ? '✓' : '✗';
    console.log(` ${status} ${results.length} riders | winner: ${winner}`);
  } catch (err) {
    console.log(` ✗ ERROR: ${err.message}`);
    validationReport.push({ type: label, count: 0, valid: false, errors: [err.message], warnings: [] });
  }
}

// Scrape points classification
for (const cls of otherClassifications) {
  if (cls.type === 'GC') continue; // Already parsed
  process.stdout.write(`  [${cls.type}] Fetching...`);

  try {
    const html = await fetchPage(cls.urlPath);
    const results = parseResultsTable(html, cls.type);
    const validation = validateClassification(results, { type: cls.type });
    allResults.push(...results);
    validationReport.push({ type: cls.type, count: results.length, ...validation });

    const winner = results[0]?.riderName || 'N/A';
    const status = validation.valid ? '✓' : '✗';
    console.log(` ${status} ${results.length} riders | winner: ${winner}`);
  } catch (err) {
    console.log(` ✗ ERROR: ${err.message}`);
    validationReport.push({ type: cls.type, count: 0, valid: false, errors: [err.message], warnings: [] });
  }
}

// ========== SUMMARY ==========
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
const uniqueRiders = new Set(allResults.map(r => r.riderSlug));
const failedValidations = validationReport.filter(v => !v.valid);
const allWarnings = validationReport.flatMap(v => v.warnings || []);

console.log(`\n${'='.repeat(70)}`);
console.log(`  SCRAPING SUMMARY`);
console.log(`${'='.repeat(70)}`);
console.log(`  Race:                ${RACE_SLUG} ${YEAR}`);
console.log(`  Time elapsed:        ${elapsed}s`);
console.log(`  Classifications:     ${validationReport.length}`);
console.log(`  Total result rows:   ${allResults.length}`);
console.log(`  Unique riders:       ${uniqueRiders.size}`);
console.log(`  Validations passed:  ${validationReport.length - failedValidations.length}/${validationReport.length}`);
console.log(`  Warnings:            ${allWarnings.length}`);

if (failedValidations.length > 0) {
  console.log(`\n  ✗ FAILED VALIDATIONS:`);
  failedValidations.forEach(v => {
    console.log(`    ${v.type}: ${v.errors.join(', ')}`);
  });
}

if (allWarnings.length > 0) {
  console.log(`\n  ⚠ WARNINGS:`);
  allWarnings.forEach(w => console.log(`    ${w}`));
}

// Stage race completeness check
const types = new Set(validationReport.map(v => v.type));
const hasGC = types.has('GC');
const hasSprint = types.has('SPRINT');
const hasMountain = types.has('MOUNTAIN');
const stageCount = validationReport.filter(v => v.type.startsWith('Stage')).length;

console.log(`\n  COMPLETENESS CHECK:`);
console.log(`    GC:       ${hasGC ? '✓' : '✗ MISSING'}`);
console.log(`    Sprint:   ${hasSprint ? '✓' : '✗ MISSING'}`);
console.log(`    Mountain: ${hasMountain ? '✓' : '✗ MISSING'}`);
console.log(`    Stages:   ${stageCount}/21 ${stageCount === 21 ? '✓' : '⚠'}`);

// Top 10 GC
console.log(`\n  TOP 10 GC:`);
const gcTop10 = allResults.filter(r => r.category === 'GC' && r.position !== null).sort((a, b) => a.position - b.position).slice(0, 10);
gcTop10.forEach(r => {
  console.log(`    ${String(r.position).padStart(2)}. ${r.riderName} (${r.teamName})`);
});

console.log(`\n${'='.repeat(70)}\n`);
