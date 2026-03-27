const express = require('express');
const axios = require('axios');

const router = express.Router();

/**
 * Proxy Google Maps Static API so the key stays on the server (no VITE_ exposure,
 * no browser referrer restrictions on the key). Enable "Maps Static API" on the same GCP project as your Geocoding key.
 */
router.get('/map-static', async (req, res) => {
  const lat = parseFloat(req.query.lat, 10);
  const lng = parseFloat(req.query.lng, 10);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Query params lat and lng are required' });
  }

  const key =
    process.env.GOOGLE_MAPS_STATIC_API_KEY
    || process.env.GOOGLE_GEOCODING_API_KEY
    || process.env.GOOGLE_PLACES_API_KEY;

  if (!key || String(key).startsWith('your_')) {
    return res.status(503).json({
      error: 'No Google Maps key on server',
      hint: 'Set GOOGLE_MAPS_STATIC_API_KEY or GOOGLE_GEOCODING_API_KEY in server/.env and restart',
    });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/staticmap');
  url.searchParams.set('center', `${lat},${lng}`);
  url.searchParams.set('zoom', '19');
  url.searchParams.set('size', '640x360');
  url.searchParams.set('maptype', 'satellite');
  url.searchParams.set('markers', `color:red|${lat},${lng}`);
  url.searchParams.set('key', key);

  try {
    const r = await axios.get(url.toString(), {
      responseType: 'arraybuffer',
      timeout: 20000,
      validateStatus: () => true,
    });

    const ct = r.headers['content-type'] || '';
    if (r.status !== 200 || !ct.includes('image')) {
      const errText = Buffer.from(r.data).toString('utf8').slice(0, 500);
      return res.status(502).json({
        error: 'Google Static Maps request failed',
        status: r.status,
        detail: errText || 'Enable Maps Static API and billing on your Google Cloud project',
      });
    }

    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=3600');
    return res.send(Buffer.from(r.data));
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Proxy failed' });
  }
});

module.exports = router;
