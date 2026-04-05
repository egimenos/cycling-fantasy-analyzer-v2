/**
 * Minimal ML service mock for E2E tests.
 * Responds to GET /health and POST /predict with deterministic dummy predictions.
 * Riders are read from the startlists table in the database so predictions
 * align with whoever the API asked for.
 */
import { createServer } from 'node:http';

const PORT = 8000;

/** Generate a deterministic score from a rider ID (hash-like) */
function scoreFromId(riderId) {
  let hash = 0;
  for (const ch of riderId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return 50 + Math.abs(hash % 200); // 50-249 range
}

const server = createServer((req, res) => {
  // GET /health
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', model_version: 'mock-v1' }));
    return;
  }

  // POST /predict
  if (req.method === 'POST' && req.url === '/predict') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const { rider_ids } = JSON.parse(body);
        const ids = Array.isArray(rider_ids) ? rider_ids : [];

        // If no rider_ids provided, return empty (the API populates via startlist)
        // For E2E we'll always get rider_ids or the ML service reads the DB.
        // Generate predictions for whatever IDs we receive.
        const predictions = ids.map((id) => {
          const score = scoreFromId(id);
          return {
            rider_id: id,
            predicted_score: score,
            breakdown: { gc: score * 0.5, stage: score * 0.3, mountain: score * 0.1, sprint: score * 0.1 },
          };
        });

        // If no rider_ids were sent, generate 20 dummy predictions using
        // the fixed UUID pattern from seed-ci.sql
        if (predictions.length === 0) {
          for (let i = 1; i <= 20; i++) {
            const id = `a0000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
            const score = 250 - i * 10;
            predictions.push({
              rider_id: id,
              predicted_score: score,
              breakdown: { gc: score * 0.5, stage: score * 0.3, mountain: score * 0.1, sprint: score * 0.1 },
            });
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ predictions }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`ML mock server listening on port ${PORT}`);
});
