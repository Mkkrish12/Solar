const { getIXPs } = require('../cache/peeringdb');
const { haversine } = require('./substation');

/**
 * Finds the nearest Internet Exchange Point to a lat/lng
 */
function getNearestIXP(lat, lng) {
  try {
    const ixps = getIXPs();
    if (!ixps || ixps.length === 0) {
      return buildFallback('IXP data not loaded');
    }

    let nearest = null;
    let minDist = Infinity;

    for (const ixp of ixps) {
      if (!ixp.lat || !ixp.lng) continue;
      const dist = haversine(lat, lng, ixp.lat, ixp.lng);
      if (dist < minDist) {
        minDist = dist;
        nearest = { ...ixp, distance: dist };
      }
    }

    if (!nearest) return buildFallback('No IXPs found in dataset');

    const distMiles = minDist.toFixed(1);
    let score;
    let interpretation;

    if (minDist < 25) {
      score = 9;
      interpretation = `IXP within 25 miles — excellent edge latency potential`;
    } else if (minDist < 100) {
      score = 6;
      interpretation = `IXP ${distMiles} miles away — moderate edge latency`;
    } else {
      score = 3;
      interpretation = `IXP ${distMiles} miles away — poor edge latency for data center`;
    }

    return {
      score,
      rawValue: `Nearest IXP: ${nearest.name || 'Unknown'} (${nearest.city || ''}), ${distMiles} miles`,
      nearestName: nearest.name || 'Unknown',
      nearestCity: nearest.city || '',
      distanceMiles: parseFloat(distMiles),
      interpretation,
    };
  } catch (err) {
    console.warn('IXP proximity failed:', err.message);
    return buildFallback(err.message);
  }
}

function buildFallback(reason) {
  return {
    score: 4,
    rawValue: `IXP data unavailable — estimated (${reason})`,
    nearestName: 'Unknown',
    distanceMiles: null,
    interpretation: 'IXP connectivity data unavailable',
    error: true,
  };
}

module.exports = { getNearestIXP };
