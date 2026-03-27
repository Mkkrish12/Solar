const { postOverpass } = require('./overpass');

/**
 * Haversine distance in miles between two lat/lng points
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Finds the nearest electrical substation using OpenStreetMap Overpass API
 * Searches within an expanding radius until substations are found
 */
async function getNearestSubstation(lat, lng) {
  const radii = [0.3, 0.75, 1.5, 3.0]; // degrees, ~20 to ~200 miles

  for (const delta of radii) {
    try {
      const bbox = `${lat - delta},${lng - delta},${lat + delta},${lng + delta}`;

      // Query both substation nodes and ways (some are mapped as polygons)
      const query = `[out:json][timeout:45];
(
  node["power"="substation"](${bbox});
  way["power"="substation"](${bbox});
)->.substations;
.substations out center 50;`;

      const response = await postOverpass(query);

      const elements = response.data?.elements || [];
      if (elements.length === 0) continue;

      // Find nearest
      let nearest = null;
      let minDist = Infinity;

      for (const el of elements) {
        const elLat = el.lat || el.center?.lat;
        const elLng = el.lon || el.center?.lon;
        if (!elLat || !elLng) continue;

        const dist = haversine(lat, lng, elLat, elLng);
        if (dist < minDist) {
          minDist = dist;
          nearest = { ...el, distMiles: dist };
        }
      }

      if (!nearest) continue;

      const distMiles = minDist.toFixed(1);
      const name = nearest.tags?.name || nearest.tags?.operator || 'Electrical Substation';
      const voltage = nearest.tags?.['voltage'] || nearest.tags?.['voltage:primary'] || '';

      let score, interpretation;
      if (minDist < 1) {
        score = 9;
        interpretation = `Substation within 1 mile — exceptional power access for data center`;
      } else if (minDist < 3) {
        score = 8;
        interpretation = `Substation ${distMiles} miles away — excellent power infrastructure`;
      } else if (minDist < 7) {
        score = 6.5;
        interpretation = `Substation ${distMiles} miles away — good power access`;
      } else if (minDist < 15) {
        score = 5;
        interpretation = `Substation ${distMiles} miles away — moderate grid connection cost`;
      } else {
        score = 3;
        interpretation = `Substation ${distMiles} miles away — significant grid infrastructure investment needed`;
      }

      console.log(`✅ Nearest substation: ${name}, ${distMiles} miles (${elements.length} found in ${Math.round(delta * 69)}mi radius)`);

      return {
        score,
        rawValue: `Nearest: ${name}${voltage ? ' (' + voltage + ' kV)' : ''}, ${distMiles} miles away`,
        nearestName: name,
        distanceMiles: parseFloat(distMiles),
        voltage,
        interpretation,
        source: 'OpenStreetMap Overpass API',
      };
    } catch (err) {
      console.warn(`Overpass substation query failed (delta=${delta}):`, err.message);
    }
  }

  return {
    score: 5,
    rawValue: 'Substation data unavailable — Overpass API busy or unreachable (retried multiple mirrors)',
    nearestName: 'Unknown',
    distanceMiles: null,
    interpretation:
      'OpenStreetMap Overpass is a free public service and can time out under load. Retry later or check https://overpass-api.de/api/status — no API key required.',
    source: 'OpenStreetMap Overpass API',
    error: true,
  };
}

module.exports = { getNearestSubstation, haversine };
