const axios = require('axios');

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
];

/**
 * POST to Overpass — tries mirrors + brief retries (public service, no API key).
 */
async function postOverpass(query, { timeoutMs = 45000 } = {}) {
  let lastErr;
  for (const url of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await axios.post(url, query, {
          headers: { 'Content-Type': 'text/plain' },
          timeout: timeoutMs,
        });
      } catch (err) {
        lastErr = err;
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastErr || new Error('Overpass unavailable');
}

module.exports = { postOverpass, OVERPASS_ENDPOINTS };
